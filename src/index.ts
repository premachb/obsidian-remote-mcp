import express, { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import { validateToken, getAuthToken } from "./auth/token.js";

const PORT = parseInt(process.env.PORT || "8080", 10);

const app = express();
app.use(express.json());

// Health check endpoint (unauthenticated)
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// MCP endpoint with authentication
app.post("/mcp", validateToken, async (req: Request, res: Response) => {
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

// Handle OPTIONS for CORS
app.options("/mcp", (_req: Request, res: Response) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.status(204).end();
});

// Initialize auth token on cold start (non-blocking)
getAuthToken().catch((err) =>
  console.warn("Failed to pre-load auth token:", err)
);

// Always start the server
// Lambda Web Adapter expects the app to listen on PORT
// For local dev, this also works fine
app.listen(PORT, () => {
  console.log(`MCP server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});

export { app };
