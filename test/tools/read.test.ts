import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadNote } from "../../src/tools/read.js";

// Mock S3 operations
vi.mock("../../src/s3/operations.js", () => ({
  readNote: vi.fn(),
  ensureMarkdownExtension: vi.fn((path: string) =>
    path.endsWith(".md") ? path : `${path}.md`
  ),
}));

import { readNote } from "../../src/s3/operations.js";

describe("read_note tool", () => {
  let server: McpServer;
  let toolHandler: (args: { path: string }) => Promise<any>;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "1.0.0" });

    // Capture the tool handler when registered
    const originalRegisterTool = server.registerTool.bind(server);
    server.registerTool = vi.fn((name, config, handler) => {
      if (name === "read_note") {
        toolHandler = handler as any;
      }
      return originalRegisterTool(name, config, handler);
    }) as any;

    registerReadNote(server);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return note content for valid path", async () => {
    const content = "# My Note\n\nSome content here.";
    vi.mocked(readNote).mockResolvedValueOnce(content);

    const result = await toolHandler({ path: "test-note.md" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe(content);
    expect(result.isError).toBeUndefined();
  });

  it("should handle path without .md extension", async () => {
    vi.mocked(readNote).mockResolvedValueOnce("content");

    await toolHandler({ path: "test-note" });

    expect(readNote).toHaveBeenCalledWith("test-note");
  });

  it("should return error for non-existent note", async () => {
    vi.mocked(readNote).mockRejectedValueOnce(
      new Error("Note not found: missing.md")
    );

    const result = await toolHandler({ path: "missing.md" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error:");
    expect(result.content[0].text).toContain("Note not found");
  });

  it("should handle S3 errors gracefully", async () => {
    vi.mocked(readNote).mockRejectedValueOnce(new Error("S3 connection failed"));

    const result = await toolHandler({ path: "note.md" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("S3 connection failed");
  });
});
