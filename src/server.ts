import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools/index.js";

/**
 * Create and configure the MCP server instance
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "obsidian-s3-mcp",
    version: "0.1.0",
  });

  // Register all tools
  registerAllTools(server);

  return server;
}
