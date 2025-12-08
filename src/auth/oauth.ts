import crypto from "crypto";
import { Request, Response } from "express";

/**
 * Simple OAuth 2.1 implementation for single-user MCP server
 *
 * This implements the minimum required for Claude's MCP connector:
 * - Authorization Server Metadata (RFC 8414)
 * - Authorization Code Grant with PKCE (OAuth 2.1)
 * - Dynamic Client Registration (RFC 7591)
 */

// In-memory storage (fine for single-user, would use DynamoDB for multi-user)
interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: number;
  used: boolean;
}

interface RegisteredClient {
  clientId: string;
  clientSecret?: string;
  redirectUris: string[];
  clientName?: string;
  createdAt: number;
}

interface AccessToken {
  token: string;
  clientId: string;
  expiresAt: number;
}

// Storage
const authorizationCodes = new Map<string, AuthorizationCode>();
const registeredClients = new Map<string, RegisteredClient>();
const accessTokens = new Map<string, AccessToken>();

// Configuration
const TOKEN_EXPIRY_SECONDS = 3600; // 1 hour
const CODE_EXPIRY_SECONDS = 600; // 10 minutes

/**
 * Generate a random string for tokens/codes
 */
function generateRandomString(length: number): string {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}

/**
 * Verify PKCE code challenge
 */
function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: string
): boolean {
  if (method === "S256") {
    const hash = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    return hash === codeChallenge;
  } else if (method === "plain") {
    return codeVerifier === codeChallenge;
  }
  return false;
}

/**
 * Get the base URL for OAuth endpoints
 */
export function getBaseUrl(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414)
 * GET /.well-known/oauth-authorization-server
 */
export function handleMetadata(req: Request, res: Response): void {
  const baseUrl = getBaseUrl(req);

  const metadata = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    code_challenge_methods_supported: ["S256", "plain"],
    scopes_supported: ["mcp:tools"],
  };

  res.json(metadata);
}

/**
 * Dynamic Client Registration (RFC 7591)
 * POST /register
 */
export function handleRegister(req: Request, res: Response): void {
  const { redirect_uris, client_name } = req.body;

  if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "redirect_uris is required",
    });
    return;
  }

  // Validate redirect URIs (must be localhost or HTTPS)
  for (const uri of redirect_uris) {
    try {
      const url = new URL(uri);
      const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      const isHttps = url.protocol === "https:";

      if (!isLocalhost && !isHttps) {
        res.status(400).json({
          error: "invalid_redirect_uri",
          error_description: "Redirect URIs must be localhost or HTTPS",
        });
        return;
      }
    } catch {
      res.status(400).json({
        error: "invalid_redirect_uri",
        error_description: "Invalid redirect URI format",
      });
      return;
    }
  }

  const clientId = generateRandomString(32);
  const clientSecret = generateRandomString(48);

  const client: RegisteredClient = {
    clientId,
    clientSecret,
    redirectUris: redirect_uris,
    clientName: client_name,
    createdAt: Date.now(),
  };

  registeredClients.set(clientId, client);

  res.status(201).json({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: redirect_uris,
    client_name: client_name,
    token_endpoint_auth_method: "client_secret_post",
  });
}

/**
 * Authorization Endpoint
 * GET /authorize
 */
export function handleAuthorize(req: Request, res: Response): void {
  const {
    client_id,
    redirect_uri,
    response_type,
    code_challenge,
    code_challenge_method,
    state,
  } = req.query as Record<string, string>;

  // Validate required parameters
  if (!client_id) {
    res.status(400).send("Missing client_id");
    return;
  }

  if (response_type !== "code") {
    res.status(400).send("Unsupported response_type. Only 'code' is supported.");
    return;
  }

  if (!redirect_uri) {
    res.status(400).send("Missing redirect_uri");
    return;
  }

  if (!code_challenge) {
    res.status(400).send("Missing code_challenge (PKCE required)");
    return;
  }

  // For single-user MVP, auto-approve the authorization
  // In a real multi-user system, you'd show a consent screen here

  // Generate authorization code
  const code = generateRandomString(48);

  const authCode: AuthorizationCode = {
    code,
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method || "plain",
    expiresAt: Date.now() + CODE_EXPIRY_SECONDS * 1000,
    used: false,
  };

  authorizationCodes.set(code, authCode);

  // Redirect back to client with code
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  res.redirect(302, redirectUrl.toString());
}

/**
 * Token Endpoint
 * POST /token
 */
export function handleToken(req: Request, res: Response): void {
  const {
    grant_type,
    code,
    redirect_uri,
    client_id,
    code_verifier,
  } = req.body;

  if (grant_type !== "authorization_code") {
    res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Only authorization_code grant is supported",
    });
    return;
  }

  if (!code) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "Missing authorization code",
    });
    return;
  }

  // Look up the authorization code
  const authCode = authorizationCodes.get(code);

  if (!authCode) {
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Invalid authorization code",
    });
    return;
  }

  // Check if code has expired
  if (Date.now() > authCode.expiresAt) {
    authorizationCodes.delete(code);
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Authorization code has expired",
    });
    return;
  }

  // Check if code has been used
  if (authCode.used) {
    // Potential replay attack - revoke any tokens issued with this code
    authorizationCodes.delete(code);
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Authorization code has already been used",
    });
    return;
  }

  // Verify client_id matches
  if (client_id && client_id !== authCode.clientId) {
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Client ID mismatch",
    });
    return;
  }

  // Verify redirect_uri matches
  if (redirect_uri && redirect_uri !== authCode.redirectUri) {
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Redirect URI mismatch",
    });
    return;
  }

  // Verify PKCE code_verifier
  if (!code_verifier) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "Missing code_verifier (PKCE required)",
    });
    return;
  }

  if (!verifyCodeChallenge(code_verifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Invalid code_verifier",
    });
    return;
  }

  // Mark code as used
  authCode.used = true;

  // Generate access token
  const accessToken = generateRandomString(64);
  const expiresAt = Date.now() + TOKEN_EXPIRY_SECONDS * 1000;

  accessTokens.set(accessToken, {
    token: accessToken,
    clientId: authCode.clientId,
    expiresAt,
  });

  // Clean up the authorization code
  authorizationCodes.delete(code);

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TOKEN_EXPIRY_SECONDS,
  });
}

/**
 * Validate an access token from the Authorization header
 * Returns true if valid, false otherwise
 */
export function validateAccessToken(authHeader: string | undefined): boolean {
  if (!authHeader) {
    return false;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return false;
  }

  const token = parts[1];
  const tokenData = accessTokens.get(token);

  if (!tokenData) {
    return false;
  }

  // Check expiration
  if (Date.now() > tokenData.expiresAt) {
    accessTokens.delete(token);
    return false;
  }

  return true;
}

/**
 * Clean up expired codes and tokens (call periodically)
 */
export function cleanupExpired(): void {
  const now = Date.now();

  for (const [code, data] of authorizationCodes) {
    if (now > data.expiresAt) {
      authorizationCodes.delete(code);
    }
  }

  for (const [token, data] of accessTokens) {
    if (now > data.expiresAt) {
      accessTokens.delete(token);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpired, 5 * 60 * 1000);
