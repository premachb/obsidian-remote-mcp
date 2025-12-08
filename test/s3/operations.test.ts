import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizePath,
  ensureMarkdownExtension,
  readNote,
  writeNote,
  noteExists,
  listFiles,
  searchNotes,
} from "../../src/s3/operations.js";

// Mock the S3 client module
vi.mock("../../src/s3/client.js", () => ({
  getS3Client: vi.fn(() => ({
    send: vi.fn(),
  })),
  getBucketName: vi.fn(() => "test-bucket"),
}));

// Import the mocked module
import { getS3Client, getBucketName } from "../../src/s3/client.js";

describe("normalizePath", () => {
  it("should remove leading slashes", () => {
    expect(normalizePath("/folder/note")).toBe("folder/note");
    expect(normalizePath("///folder/note")).toBe("folder/note");
  });

  it("should collapse multiple slashes", () => {
    expect(normalizePath("folder//subfolder///note")).toBe(
      "folder/subfolder/note"
    );
  });

  it("should trim whitespace", () => {
    expect(normalizePath("  folder/note  ")).toBe("folder/note");
  });

  it("should handle empty string", () => {
    expect(normalizePath("")).toBe("");
  });
});

describe("ensureMarkdownExtension", () => {
  it("should add .md extension if missing", () => {
    expect(ensureMarkdownExtension("note")).toBe("note.md");
    expect(ensureMarkdownExtension("folder/note")).toBe("folder/note.md");
  });

  it("should not duplicate .md extension", () => {
    expect(ensureMarkdownExtension("note.md")).toBe("note.md");
    expect(ensureMarkdownExtension("folder/note.md")).toBe("folder/note.md");
  });

  it("should handle paths with leading slashes", () => {
    expect(ensureMarkdownExtension("/folder/note")).toBe("folder/note.md");
  });
});

describe("readNote", () => {
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn();
    vi.mocked(getS3Client).mockReturnValue({ send: mockSend } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return note content", async () => {
    const content = "# Test Note\n\nThis is content.";
    mockSend.mockResolvedValueOnce({
      Body: {
        transformToString: () => Promise.resolve(content),
      },
    });

    const result = await readNote("test-note.md");
    expect(result).toBe(content);
  });

  it("should auto-add .md extension", async () => {
    mockSend.mockResolvedValueOnce({
      Body: {
        transformToString: () => Promise.resolve("content"),
      },
    });

    await readNote("test-note");

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Key: "test-note.md",
        }),
      })
    );
  });

  it("should throw error for non-existent note", async () => {
    const error = new Error("NoSuchKey");
    (error as any).name = "NoSuchKey";
    mockSend.mockRejectedValueOnce(error);

    await expect(readNote("missing.md")).rejects.toThrow("Note not found");
  });
});

describe("writeNote", () => {
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn();
    vi.mocked(getS3Client).mockReturnValue({ send: mockSend } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should write note with correct content type", async () => {
    mockSend.mockResolvedValueOnce({});

    await writeNote("test-note", "# Content");

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Key: "test-note.md",
          Body: "# Content",
          ContentType: "text/markdown; charset=utf-8",
        }),
      })
    );
  });
});

describe("noteExists", () => {
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn();
    vi.mocked(getS3Client).mockReturnValue({ send: mockSend } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return true for existing note", async () => {
    mockSend.mockResolvedValueOnce({});

    const result = await noteExists("existing-note");
    expect(result).toBe(true);
  });

  it("should return false for non-existent note", async () => {
    const error = new Error("NotFound");
    (error as any).$metadata = { httpStatusCode: 404 };
    mockSend.mockRejectedValueOnce(error);

    const result = await noteExists("missing-note");
    expect(result).toBe(false);
  });
});

describe("listFiles", () => {
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn();
    vi.mocked(getS3Client).mockReturnValue({ send: mockSend } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should list files and folders", async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [
        { Key: "note1.md", LastModified: new Date(), Size: 100 },
        { Key: "note2.md", LastModified: new Date(), Size: 200 },
      ],
      CommonPrefixes: [{ Prefix: "subfolder/" }],
      IsTruncated: false,
    });

    const result = await listFiles();

    expect(result.files).toHaveLength(2);
    expect(result.folders).toEqual(["subfolder/"]);
    expect(result.truncated).toBe(false);
  });

  it("should filter for .md files only", async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [
        { Key: "note.md", LastModified: new Date(), Size: 100 },
        { Key: "image.png", LastModified: new Date(), Size: 1000 },
      ],
      CommonPrefixes: [],
      IsTruncated: false,
    });

    const result = await listFiles();

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("note.md");
  });

  it("should handle prefix with trailing slash", async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [],
      CommonPrefixes: [],
      IsTruncated: false,
    });

    await listFiles("folder");

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Prefix: "folder/",
        }),
      })
    );
  });
});

describe("searchNotes", () => {
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn();
    vi.mocked(getS3Client).mockReturnValue({ send: mockSend } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should find notes containing query", async () => {
    // First call: list files
    mockSend.mockResolvedValueOnce({
      Contents: [{ Key: "note1.md" }, { Key: "note2.md" }],
      IsTruncated: false,
    });

    // Second call: read note1 (matches)
    mockSend.mockResolvedValueOnce({
      Body: {
        transformToString: () =>
          Promise.resolve("This note contains the search term."),
      },
    });

    // Third call: read note2 (no match)
    mockSend.mockResolvedValueOnce({
      Body: {
        transformToString: () => Promise.resolve("This note has other content."),
      },
    });

    const results = await searchNotes("search term");

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("note1.md");
    expect(results[0].snippet).toContain("search term");
  });

  it("should be case-insensitive", async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [{ Key: "note.md" }],
      IsTruncated: false,
    });

    mockSend.mockResolvedValueOnce({
      Body: {
        transformToString: () =>
          Promise.resolve("This has UPPERCASE content."),
      },
    });

    const results = await searchNotes("uppercase");

    expect(results).toHaveLength(1);
  });

  it("should respect maxResults limit", async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [
        { Key: "note1.md" },
        { Key: "note2.md" },
        { Key: "note3.md" },
      ],
      IsTruncated: false,
    });

    // All notes match
    for (let i = 0; i < 3; i++) {
      mockSend.mockResolvedValueOnce({
        Body: {
          transformToString: () => Promise.resolve("matching content"),
        },
      });
    }

    const results = await searchNotes("matching", "", 2);

    expect(results).toHaveLength(2);
  });
});
