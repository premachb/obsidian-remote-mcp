/**
 * Standard MCP tool result interface
 * Compatible with MCP SDK's expected return type
 */
export interface ToolResult {
  [x: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Metadata for a note/file in the vault
 */
export interface NoteMetadata {
  path: string;
  lastModified: Date;
  size: number;
}

/**
 * Result from listing files in a directory
 */
export interface ListResult {
  files: NoteMetadata[];
  folders: string[];
  truncated: boolean;
  continuationToken?: string;
}

/**
 * Search result with matching snippet
 */
export interface SearchResult {
  path: string;
  snippet: string;
}

/**
 * Create a successful text result for MCP tools
 */
export function textResult(text: string): ToolResult {
  return {
    content: [{ type: "text", text }],
  };
}

/**
 * Create an error result for MCP tools
 */
export function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}
