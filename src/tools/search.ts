import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchNotes } from "../s3/operations.js";
import { textResult, errorResult } from "../types/index.js";

export const searchNotesSchema = {
  query: z.string().min(2).describe("Search query (minimum 2 characters)"),
  path: z
    .string()
    .optional()
    .default("")
    .describe("Limit search to this directory"),
  max_results: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of results to return"),
};

export function registerSearchNotes(server: McpServer): void {
  server.tool(
    "search_notes",
    "Search for notes containing specific text",
    searchNotesSchema,
    async ({ query, path, max_results }) => {
      try {
        const results = await searchNotes(query, path, max_results);

        if (results.length === 0) {
          return textResult(`No notes found containing '${query}'`);
        }

        const output: string[] = [];
        output.push(`## Search Results for "${query}"`);
        output.push("");

        results.forEach((result, index) => {
          output.push(`### ${index + 1}. ${result.path}`);
          output.push(`> ${result.snippet}`);
          output.push("");
        });

        return textResult(output.join("\n"));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return errorResult(`Search failed: ${message}`);
      }
    }
  );
}
