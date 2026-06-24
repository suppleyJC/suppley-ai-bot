/**
 * Storage abstraction layer using AWS S3
 *
 * Replaces legacy Manus Forge storage with AWS S3 for scalability and compliance.
 * Uses presigned URLs for secure file access without exposing credentials.
 */

import { s3Client } from './_core/s3Client';

/**
 * Upload file to S3 storage
 * @param relKey - Relative key path (e.g., "quotations/user-123/file.pdf")
 * @param data - File content as Buffer, Uint8Array, or string
 * @param contentType - MIME type (default: "application/octet-stream")
 * @returns Object with storage key and presigned URL (valid for 1 hour)
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);

  try {
    return await s3Client.upload(key, data, contentType);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Storage upload failed: ${message}`);
  }
}

/**
 * Get presigned URL for downloading file from S3
 * @param relKey - Relative key path
 * @param expiresIn - URL expiration time in seconds (default: 1 hour = 3600s)
 * @returns Object with storage key and presigned URL
 */
export async function storageGet(
  relKey: string,
  expiresIn: number = 3600
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);

  try {
    const url = await s3Client.getSignedUrl(key, expiresIn);
    return { key, url };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to generate download URL: ${message}`);
  }
}

/**
 * Delete file from S3 bucket
 * @param relKey - Relative key path
 */
export async function storageDelete(relKey: string): Promise<void> {
  const key = normalizeKey(relKey);

  try {
    await s3Client.delete(key);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Storage delete failed: ${message}`);
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Normalize S3 key by removing leading slashes
 */
function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}
