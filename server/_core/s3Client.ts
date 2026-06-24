/**
 * AWS S3 Storage Client
 * Centraliza upload/download de arquivos com presigned URLs
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class S3StorageClient {
  private client: S3Client | null = null;
  private bucket: string;
  private region: string;

  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET || "";
    this.region = process.env.AWS_REGION || "us-east-1";

    if (!this.bucket) {
      throw new Error(
        "AWS_S3_BUCKET environment variable not configured"
      );
    }
  }

  private getClient(): S3Client {
    if (!this.client) {
      const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
      const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

      if (!accessKeyId || !secretAccessKey) {
        throw new Error(
          "AWS credentials not configured: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY"
        );
      }

      this.client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }
    return this.client;
  }

  /**
   * Upload file to S3 bucket
   */
  async upload(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType: string = "application/octet-stream"
  ): Promise<{ key: string; url: string }> {
    const bufferBody =
      typeof body === "string" ? Buffer.from(body) : Buffer.from(body);

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bufferBody,
        ContentType: contentType,
        Metadata: {
          uploadedAt: new Date().toISOString(),
        },
      });

      await this.getClient().send(command);

      // Generate presigned URL valid for 1 hour
      const url = await this.getSignedUrl(key, 3600);

      return { key, url };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      throw new Error(`S3 upload failed: ${message}`);
    }
  }

  /**
   * Generate presigned URL for downloading/accessing file
   */
  async getSignedUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      return await getSignedUrl(this.getClient(), command, {
        expiresIn,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to generate presigned URL: ${message}`);
    }
  }

  /**
   * Delete file from S3 bucket
   */
  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.getClient().send(command);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      throw new Error(`S3 delete failed: ${message}`);
    }
  }
}

// Singleton instance
export const s3Client = new S3StorageClient();
