import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { env } from '../config/env.js';

type ObjectMetadata = {
  contentLength: number;
  contentType: string | undefined;
};

@Injectable()
export class StorageService {
  private readonly internalClient = this.createClient(env.S3_ENDPOINT);
  private readonly publicClient = this.createClient(env.S3_PUBLIC_ENDPOINT);
  private bucketReady: Promise<void> | undefined;

  async createPresignedUpload(key: string, contentType: string) {
    await this.ensureBucket();
    const expiresIn = env.IMPORT_UPLOAD_TTL_SECONDS;
    const url = await getSignedUrl(
      this.publicClient,
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn },
    );
    return {
      url,
      method: 'PUT' as const,
      headers: { 'content-type': contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    await this.ensureBucket();
    try {
      const result = await this.internalClient.send(
        new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
      );
      return {
        contentLength: result.ContentLength ?? 0,
        contentType: result.ContentType,
      };
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw error;
    }
  }

  async downloadObject(key: string, destination: string) {
    await this.ensureBucket();
    const result = await this.internalClient.send(
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    );
    if (!result.Body || !(result.Body instanceof Readable)) {
      throw new Error('Object storage returned an unreadable upload');
    }
    await pipeline(
      result.Body,
      createWriteStream(destination, { flags: 'wx' }),
    );
  }

  private createClient(endpoint: string) {
    return new S3Client({
      endpoint,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    });
  }

  private async ensureBucket() {
    this.bucketReady ??= this.initializeBucket().catch((error: unknown) => {
      this.bucketReady = undefined;
      throw new ServiceUnavailableException(
        `Object storage is unavailable: ${this.errorMessage(error)}`,
      );
    });
    await this.bucketReady;
  }

  private async initializeBucket() {
    try {
      await this.internalClient.send(
        new HeadBucketCommand({ Bucket: env.S3_BUCKET }),
      );
    } catch (error) {
      if (!this.isNotFound(error)) throw error;
      await this.internalClient.send(
        new CreateBucketCommand({ Bucket: env.S3_BUCKET }),
      );
    }
  }

  private isNotFound(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    return (
      candidate.name === 'NotFound' ||
      candidate.name === 'NoSuchKey' ||
      candidate.$metadata?.httpStatusCode === 404
    );
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'connection failed';
  }
}
