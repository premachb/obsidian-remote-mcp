import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadNote } from "./read.js";
import { registerWriteNote } from "./write.js";
import { registerListFiles } from "./list.js";
import { registerSearchNotes } from "./search.js";

/**
 * Register all MCP tools with the server
 */
export function registerAllTools(server: McpServer): void {
  registerReadNote(server);
  registerWriteNote(server);
  registerListFiles(server);
  registerSearchNotes(server);
}
