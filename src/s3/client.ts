import { S3Client } from "@aws-sdk/client-s3";

/**
 * Singleton S3 client - initialized once per Lambda cold start
 */
let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }
  return s3Client;
}

/**
 * Reset S3 client (for testing)
 */
export function resetS3Client(): void {
  s3Client = null;
}

/**
 * Get the S3 bucket name from environment
 */
export function getBucketName(): string {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) {
    throw new Error("S3_BUCKET_NAME environment variable is not set");
  }
  return bucket;
}
