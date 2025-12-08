import {
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import { getS3Client, getBucketName } from "./client.js";
import type { ListResult, NoteMetadata, SearchResult } from "../types/index.js";

/**
 * Normalize a file path:
 * - Remove leading slashes
 * - Collapse multiple slashes
 * - Trim whitespace
 */
export function normalizePath(path: string): string {
  return path.trim().replace(/^\/+/, "").replace(/\/+/g, "/");
}

/**
 * Ensure path has .md extension
 */
export function ensureMarkdownExtension(path: string): string {
  const normalized = normalizePath(path);
  return normalized.endsWith(".md") ? normalized : `${normalized}.md`;
}

/**
 * Read a note's content from S3
 */
export async function readNote(path: string): Promise<string> {
  const client = getS3Client();
  const bucket = getBucketName();
  const key = ensureMarkdownExtension(path);

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  try {
    const response = await client.send(command);
    const body = await response.Body?.transformToString();

    if (body === undefined) {
      throw new Error(`Note is empty or unreadable: ${path}`);
    }

    return body;
  } catch (error) {
    if (error instanceof NoSuchKey || (error as any).name === "NoSuchKey") {
      throw new Error(`Note not found: ${path}`);
    }
    throw error;
  }
}

/**
 * Write/update a note in S3
 */
export async function writeNote(path: string, content: string): Promise<void> {
  const client = getS3Client();
  const bucket = getBucketName();
  const key = ensureMarkdownExtension(path);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: content,
    ContentType: "text/markdown; charset=utf-8",
  });

  await client.send(command);
}

/**
 * Check if a note exists in S3
 */
export async function noteExists(path: string): Promise<boolean> {
  const client = getS3Client();
  const bucket = getBucketName();
  const key = ensureMarkdownExtension(path);

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return true;
  } catch (error) {
    if (error instanceof NoSuchKey || (error as any).name === "NotFound") {
      return false;
    }
    // For HeadObject, 404s come as different error types
    if ((error as any).$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * List files and folders in a directory
 */
export async function listFiles(
  prefix: string = "",
  maxKeys: number = 100,
  continuationToken?: string
): Promise<ListResult> {
  const client = getS3Client();
  const bucket = getBucketName();

  // Normalize prefix and ensure it ends with / for directory listing (unless empty)
  let normalizedPrefix = normalizePath(prefix);
  if (normalizedPrefix && !normalizedPrefix.endsWith("/")) {
    normalizedPrefix = `${normalizedPrefix}/`;
  }

  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: normalizedPrefix,
    Delimiter: "/",
    MaxKeys: maxKeys,
    ContinuationToken: continuationToken,
  });

  const response = await client.send(command);

  const files: NoteMetadata[] = (response.Contents || [])
    .filter((obj) => obj.Key?.endsWith(".md"))
    .map((obj) => ({
      path: obj.Key!,
      lastModified: obj.LastModified!,
      size: obj.Size!,
    }));

  const folders: string[] = (response.CommonPrefixes || [])
    .map((prefix) => prefix.Prefix!)
    .filter(Boolean);

  return {
    files,
    folders,
    truncated: response.IsTruncated || false,
    continuationToken: response.NextContinuationToken,
  };
}

/**
 * Search notes by content (simple substring match)
 * This is a brute-force search suitable for small-medium vaults
 */
export async function searchNotes(
  query: string,
  prefix: string = "",
  maxResults: number = 10
): Promise<SearchResult[]> {
  const client = getS3Client();
  const bucket = getBucketName();
  const results: SearchResult[] = [];
  const normalizedPrefix = normalizePath(prefix);

  // Collect all markdown files
  const allFiles: string[] = [];
  let continuationToken: string | undefined;

  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: normalizedPrefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    });

    const listResponse = await client.send(listCommand);

    const mdFiles = (listResponse.Contents || [])
      .filter((obj) => obj.Key?.endsWith(".md"))
      .map((obj) => obj.Key!);

    allFiles.push(...mdFiles);
    continuationToken = listResponse.NextContinuationToken;

    // Cap at 500 files for MVP to prevent timeout
    if (allFiles.length >= 500) {
      break;
    }
  } while (continuationToken);

  // Search through files
  const queryLower = query.toLowerCase();

  for (const filePath of allFiles) {
    if (results.length >= maxResults) {
      break;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: filePath,
      });

      const response = await client.send(command);
      const content = await response.Body?.transformToString();

      if (!content) continue;

      const contentLower = content.toLowerCase();
      const index = contentLower.indexOf(queryLower);

      if (index !== -1) {
        // Extract snippet around match (50 chars before and after)
        const start = Math.max(0, index - 50);
        const end = Math.min(content.length, index + query.length + 50);

        let snippet = content.slice(start, end);
        if (start > 0) snippet = "..." + snippet;
        if (end < content.length) snippet = snippet + "...";

        // Clean up snippet (remove newlines, normalize whitespace)
        snippet = snippet.replace(/\s+/g, " ").trim();

        results.push({ path: filePath, snippet });
      }
    } catch (error) {
      // Skip files that can't be read (permissions, deleted, etc.)
      console.warn(`Failed to read ${filePath}:`, error);
    }
  }

  return results;
}
