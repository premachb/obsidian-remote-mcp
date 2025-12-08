import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListFiles } from "../../src/tools/list.js";

// Mock S3 operations
vi.mock("../../src/s3/operations.js", () => ({
  listFiles: vi.fn(),
}));

import { listFiles } from "../../src/s3/operations.js";

describe("list_files tool", () => {
  let server: McpServer;
  let toolHandler: (args: {
    path?: string;
    max_results?: number;
  }) => Promise<any>;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "1.0.0" });

    const originalRegisterTool = server.registerTool.bind(server);
    server.registerTool = vi.fn((name, config, handler) => {
      if (name === "list_files") {
        toolHandler = handler as any;
      }
      return originalRegisterTool(name, config, handler);
    }) as any;

    registerListFiles(server);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should list files and folders", async () => {
    vi.mocked(listFiles).mockResolvedValueOnce({
      files: [
        { path: "note1.md", lastModified: new Date(), size: 1024 },
        { path: "note2.md", lastModified: new Date(), size: 2048 },
      ],
      folders: ["subfolder/"],
      truncated: false,
    });

    const result = await toolHandler({});

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("## Folders");
    expect(result.content[0].text).toContain("📁 subfolder");
    expect(result.content[0].text).toContain("## Files");
    expect(result.content[0].text).toContain("📄 note1.md");
    expect(result.content[0].text).toContain("📄 note2.md");
  });

  it("should show file sizes", async () => {
    vi.mocked(listFiles).mockResolvedValueOnce({
      files: [{ path: "note.md", lastModified: new Date(), size: 1536 }],
      folders: [],
      truncated: false,
    });

    const result = await toolHandler({});

    expect(result.content[0].text).toContain("1.5 KB");
  });

  it("should indicate truncated results", async () => {
    vi.mocked(listFiles).mockResolvedValueOnce({
      files: [],
      folders: [],
      truncated: true,
    });

    const result = await toolHandler({});

    expect(result.content[0].text).toContain("Results truncated");
  });

  it("should handle empty directory", async () => {
    vi.mocked(listFiles).mockResolvedValueOnce({
      files: [],
      folders: [],
      truncated: false,
    });

    const result = await toolHandler({ path: "empty-folder" });

    expect(result.content[0].text).toContain("No files found");
  });

  it("should pass path and max_results to listFiles", async () => {
    vi.mocked(listFiles).mockResolvedValueOnce({
      files: [],
      folders: [],
      truncated: false,
    });

    await toolHandler({ path: "my-folder", max_results: 25 });

    expect(listFiles).toHaveBeenCalledWith("my-folder", 25);
  });

  it("should handle errors gracefully", async () => {
    vi.mocked(listFiles).mockRejectedValueOnce(new Error("Access denied"));

    const result = await toolHandler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Access denied");
  });
});
