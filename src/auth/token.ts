import type { Request, Response, NextFunction } from "express";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

// Cached auth token (resolved once per Lambda lifecycle)
let cachedAuthToken: string | null = null;

/**
 * Get the auth token from Secrets Manager or environment variable.
 * Caches the result for the lifetime of the Lambda instance.
 */
export async function getAuthToken(): Promise<string> {
  if (cachedAuthToken) {
    return cachedAuthToken;
  }

  // Check for direct token (local development)
  const directToken = process.env.AUTH_TOKEN;
  if (directToken) {
    cachedAuthToken = directToken;
    return cachedAuthToken;
  }

  // Get from Secrets Manager (production)
  const secretArn = process.env.AUTH_TOKEN_SECRET_ARN;
  if (!secretArn) {
    throw new Error(
      "Neither AUTH_TOKEN nor AUTH_TOKEN_SECRET_ARN is configured"
    );
  }

  const client = new SecretsManagerClient({});
  const command = new GetSecretValueCommand({ SecretId: secretArn });
  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error("Failed to retrieve auth token from Secrets Manager");
  }

  cachedAuthToken = response.SecretString;
  return cachedAuthToken;
}

/**
 * Reset cached token (for testing)
 */
export function resetAuthTokenCache(): void {
  cachedAuthToken = null;
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Express middleware for bearer token validation
 */
export function validateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip auth for health check
  if (req.path === "/health") {
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Missing Authorization header",
      },
      id: null,
    });
    return;
  }

  // Expect: "Bearer <token>"
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Invalid Authorization header format. Expected: Bearer <token>",
      },
      id: null,
    });
    return;
  }

  const providedToken = parts[1];

  // Async token validation
  getAuthToken()
    .then((expectedToken) => {
      if (!constantTimeCompare(providedToken, expectedToken)) {
        res.status(403).json({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "Invalid token",
          },
          id: null,
        });
        return;
      }

      next();
    })
    .catch((error) => {
      console.error("Auth token retrieval failed:", error);
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Server configuration error",
        },
        id: null,
      });
    });
}
