import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchNotes } from "../../src/tools/search.js";

// Mock S3 operations
vi.mock("../../src/s3/operations.js", () => ({
  searchNotes: vi.fn(),
}));

import { searchNotes } from "../../src/s3/operations.js";

describe("search_notes tool", () => {
  let server: McpServer;
  let toolHandler: (args: {
    query: string;
    path?: string;
    max_results?: number;
  }) => Promise<any>;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "1.0.0" });

    const originalTool = server.tool.bind(server);
    server.tool = vi.fn((name, description, schema, handler) => {
      if (name === "search_notes") {
        toolHandler = handler as any;
      }
      return originalTool(name, description, schema, handler);
    }) as any;

    registerSearchNotes(server);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return search results with snippets", async () => {
    vi.mocked(searchNotes).mockResolvedValueOnce([
      { path: "note1.md", snippet: "...found the search term here..." },
      { path: "folder/note2.md", snippet: "...another search term match..." },
    ]);

    const result = await toolHandler({ query: "search term" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Search Results for "search term"');
    expect(result.content[0].text).toContain("note1.md");
    expect(result.content[0].text).toContain("folder/note2.md");
    expect(result.content[0].text).toContain("found the search term here");
  });

  it("should handle no results", async () => {
    vi.mocked(searchNotes).mockResolvedValueOnce([]);

    const result = await toolHandler({ query: "nonexistent" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(
      "No notes found containing 'nonexistent'"
    );
  });

  it("should pass parameters to searchNotes", async () => {
    vi.mocked(searchNotes).mockResolvedValueOnce([]);

    await toolHandler({
      query: "test",
      path: "subfolder",
      max_results: 5,
    });

    expect(searchNotes).toHaveBeenCalledWith("test", "subfolder", 5);
  });

  it("should number results", async () => {
    vi.mocked(searchNotes).mockResolvedValueOnce([
      { path: "note1.md", snippet: "snippet 1" },
      { path: "note2.md", snippet: "snippet 2" },
      { path: "note3.md", snippet: "snippet 3" },
    ]);

    const result = await toolHandler({ query: "test" });

    expect(result.content[0].text).toContain("### 1.");
    expect(result.content[0].text).toContain("### 2.");
    expect(result.content[0].text).toContain("### 3.");
  });

  it("should handle search errors gracefully", async () => {
    vi.mocked(searchNotes).mockRejectedValueOnce(new Error("Search timeout"));

    const result = await toolHandler({ query: "test" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Search failed");
    expect(result.content[0].text).toContain("Search timeout");
  });
});
