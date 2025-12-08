import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWriteNote } from "../../src/tools/write.js";

// Mock S3 operations
vi.mock("../../src/s3/operations.js", () => ({
  writeNote: vi.fn(),
  noteExists: vi.fn(),
  ensureMarkdownExtension: vi.fn((path: string) =>
    path.endsWith(".md") ? path : `${path}.md`
  ),
}));

import { writeNote, noteExists } from "../../src/s3/operations.js";

describe("write_note tool", () => {
  let server: McpServer;
  let toolHandler: (args: {
    path: string;
    content: string;
    overwrite?: boolean;
  }) => Promise<any>;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "1.0.0" });

    const originalRegisterTool = server.registerTool.bind(server);
    server.registerTool = vi.fn((name, config, handler) => {
      if (name === "write_note") {
        toolHandler = handler as any;
      }
      return originalRegisterTool(name, config, handler);
    }) as any;

    registerWriteNote(server);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should create new note when it does not exist", async () => {
    vi.mocked(noteExists).mockResolvedValueOnce(false);
    vi.mocked(writeNote).mockResolvedValueOnce(undefined);

    const result = await toolHandler({
      path: "new-note",
      content: "# New Note",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Created note");
    expect(writeNote).toHaveBeenCalledWith("new-note", "# New Note");
  });

  it("should refuse to overwrite existing note without flag", async () => {
    vi.mocked(noteExists).mockResolvedValueOnce(true);

    const result = await toolHandler({
      path: "existing-note",
      content: "# Updated",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("already exists");
    expect(result.content[0].text).toContain("overwrite=true");
    expect(writeNote).not.toHaveBeenCalled();
  });

  it("should overwrite existing note when overwrite=true", async () => {
    vi.mocked(noteExists).mockResolvedValueOnce(true);
    vi.mocked(writeNote).mockResolvedValueOnce(undefined);

    const result = await toolHandler({
      path: "existing-note",
      content: "# Updated",
      overwrite: true,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Updated note");
    expect(writeNote).toHaveBeenCalled();
  });

  it("should handle write errors gracefully", async () => {
    vi.mocked(noteExists).mockResolvedValueOnce(false);
    vi.mocked(writeNote).mockRejectedValueOnce(new Error("Write failed"));

    const result = await toolHandler({
      path: "note",
      content: "content",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Write failed");
  });
});
