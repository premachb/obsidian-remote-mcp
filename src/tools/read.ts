import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readNote } from "../s3/operations.js";
import { textResult, errorResult } from "../types/index.js";

export const readNoteSchema = {
  path: z
    .string()
    .describe("Path to the note (e.g., 'folder/note.md' or 'note')"),
};

export function registerReadNote(server: McpServer): void {
  server.tool(
    "read_note",
    "Read the contents of a note from the Obsidian vault",
    readNoteSchema,
    async ({ path }) => {
      try {
        const content = await readNote(path);
        return textResult(content);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return errorResult(`Failed to read note '${path}': ${message}`);
      }
    }
  );
}
