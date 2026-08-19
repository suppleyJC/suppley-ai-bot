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
 * Normalize S3 key by removing leading slashes.
 *
 * ACEITA TAMBÉM UMA URL COMPLETA (pré-assinada ou não): registros legados
 * gravaram a URL inteira no campo fileKey — re-assinar "https://…" como se
 * fosse chave devolvia NoSuchKey. Aqui extraímos a chave real do caminho
 * (descartando query string) e, no estilo path (s3.região.amazonaws.com/
 * bucket/chave), descartamos também o bucket.
 */
function normalizeKey(relKey: string): string {
  let key = relKey;
  if (/^https?:\/\//i.test(key)) {
    try {
      const u = new URL(key);
      let path = decodeURIComponent(u.pathname);
      if (/^s3[.-]/i.test(u.hostname)) {
        // path-style: /bucket/chave... → remove o 1º segmento (bucket)
        path = path.replace(/^\/[^/]+/, "");
      }
      key = path;
    } catch { /* segue com o valor original */ }
  }
  return key.replace(/^\/+/, "");
}
