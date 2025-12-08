import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeNote, noteExists, ensureMarkdownExtension } from "../s3/operations.js";
import { textResult, errorResult } from "../types/index.js";

export const writeNoteSchema = {
  path: z
    .string()
    .describe("Path for the note (e.g., 'folder/note.md' or 'note')"),
  content: z.string().describe("Markdown content of the note"),
  overwrite: z
    .boolean()
    .optional()
    .default(false)
    .describe("Set to true to overwrite existing notes"),
};

export function registerWriteNote(server: McpServer): void {
  server.registerTool(
    "write_note",
    {
      description: "Create a new note or update an existing note in the Obsidian vault",
      inputSchema: writeNoteSchema,
    },
    async ({ path, content, overwrite }) => {
      try {
        const normalizedPath = ensureMarkdownExtension(path);

        // Check if note exists (protection against accidental overwrites)
        const exists = await noteExists(path);
        if (exists && !overwrite) {
          return errorResult(
            `Note '${normalizedPath}' already exists. Set overwrite=true to replace it.`
          );
        }

        await writeNote(path, content);

        const action = exists ? "Updated" : "Created";
        return textResult(`${action} note: ${normalizedPath}`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return errorResult(`Failed to write note '${path}': ${message}`);
      }
    }
  );
}
