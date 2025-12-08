import express, { Request, Response, NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import {
  handleMetadata,
  handleRegister,
  handleAuthorize,
  handleToken,
  validateAccessToken,
} from "./auth/oauth.js";

const PORT = parseInt(process.env.PORT || "8080", 10);

const app = express();

// Parse URL-encoded bodies (for OAuth token endpoint)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// CORS middleware for all routes
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, MCP-Protocol-Version");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

// Health check endpoint (unauthenticated)
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// OAuth 2.0 Authorization Server Metadata (RFC 8414)
app.get("/.well-known/oauth-authorization-server", handleMetadata);

// Dynamic Client Registration (RFC 7591)
app.post("/register", handleRegister);

// Authorization Endpoint
app.get("/authorize", handleAuthorize);

// Token Endpoint
app.post("/token", handleToken);

/**
 * OAuth token validation middleware
 * Returns 401 if no valid token, allowing the OAuth flow to begin
 */
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!validateAccessToken(authHeader)) {
    // Return 401 with WWW-Authenticate header to trigger OAuth flow
    res.setHeader("WWW-Authenticate", 'Bearer realm="mcp"');
    res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Unauthorized - valid Bearer token required",
      },
      id: null,
    });
    return;
  }

  next();
}

// MCP endpoint with OAuth authentication
app.post("/mcp", requireAuth, async (req: Request, res: Response) => {
  try {
    // Create fresh server instance per request (stateless)
    const server = createMcpServer();

    // Create transport for this request
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless - no session management
    });

    // Connect server to transport
    await server.connect(transport);

    // Handle the MCP request
    await transport.handleRequest(req, res, req.body);

    // Clean up on request close
    req.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("MCP request error:", error);

    // Only send error if response not already sent
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

// Always start the server
// Lambda Web Adapter expects the app to listen on PORT
// For local dev, this also works fine
app.listen(PORT, () => {
  console.log(`MCP server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`OAuth metadata: http://localhost:${PORT}/.well-known/oauth-authorization-server`);
});

export { app };
