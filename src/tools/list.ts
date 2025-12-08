import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listFiles } from "../s3/operations.js";
import { textResult, errorResult } from "../types/index.js";

export const listFilesSchema = {
  path: z
    .string()
    .optional()
    .default("")
    .describe("Directory path to list (empty for root)"),
  max_results: z
    .number()
    .optional()
    .default(50)
    .describe("Maximum number of items to return"),
};

export function registerListFiles(server: McpServer): void {
  server.tool(
    "list_files",
    "List files and folders in the Obsidian vault",
    listFilesSchema,
    async ({ path, max_results }) => {
      try {
        const result = await listFiles(path, max_results);

        const output: string[] = [];

        if (result.folders.length > 0) {
          output.push("## Folders");
          result.folders.forEach((folder) => {
            // Remove trailing slash for display
            const displayName = folder.endsWith("/")
              ? folder.slice(0, -1)
              : folder;
            output.push(`- 📁 ${displayName}`);
          });
        }

        if (result.files.length > 0) {
          if (output.length > 0) output.push("");
          output.push("## Files");
          result.files.forEach((file) => {
            const sizeKb = (file.size / 1024).toFixed(1);
            output.push(`- 📄 ${file.path} (${sizeKb} KB)`);
          });
        }

        if (result.truncated) {
          output.push("");
          output.push("_Results truncated. More items available._");
        }

        if (output.length === 0) {
          return textResult(`No files found in '${path || "/"}'`);
        }

        return textResult(output.join("\n"));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return errorResult(`Failed to list files: ${message}`);
      }
    }
  );
}
