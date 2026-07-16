import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Injectable, Logger } from "@nestjs/common";

export type UploadResult = {
  key: string;
  etag?: string;
  publicUrl?: string;
};

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket?: string;
  private readonly publicBaseUrl?: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const endpointUrl = process.env.R2_ENDPOINT_URL;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucket = process.env.R2_BUCKET;
    this.publicBaseUrl = normalizePublicBaseUrl(process.env.R2_PUBLIC_BASE_URL);

    this.client =
      (endpointUrl || accountId) && accessKeyId && secretAccessKey && this.bucket
        ? new S3Client({
            region: "auto",
            endpoint: endpointUrl ?? `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId, secretAccessKey }
          })
        : null;
  }

  enabled(): boolean {
    return Boolean(this.client && this.bucket);
  }

  getPublicBaseUrl(): string | undefined {
    return this.publicBaseUrl;
  }

  getPublicUrl(key: string): string | undefined {
    return this.publicBaseUrl ? `${this.publicBaseUrl.replace(/\/$/, "")}/${key}` : undefined;
  }

  async downloadJson(key: string): Promise<string | null> {
    const url = this.getPublicUrl(key);
    if (!url) return null;

    const response = await fetch(url);
    if (!response.ok) {
      this.logger.debug(`R2 public read failed for ${key}: ${response.status}`);
      return null;
    }

    const body = await response.text();
    JSON.parse(body);
    return body;
  }

  async uploadJson(key: string, body: string): Promise<UploadResult | null> {
    if (!this.client || !this.bucket) {
      this.logger.debug(`R2 not configured; skipped upload for ${key}`);
      return null;
    }

    const response = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: "application/json",
        CacheControl: "public, max-age=300, stale-while-revalidate=3600"
      })
    );

    return {
      key,
      etag: response.ETag,
      publicUrl: this.getPublicUrl(key)
    };
  }

  async deletePrefix(prefix: string): Promise<{ deleted: number }> {
    if (!this.client || !this.bucket) {
      this.logger.debug(`R2 not configured; skipped deleting prefix ${prefix}`);
      return { deleted: 0 };
    }

    let continuationToken: string | undefined;
    let deleted = 0;

    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken
        })
      );
      const objects = (listed.Contents ?? []).map((object) => ({ Key: object.Key })).filter((object) => object.Key);

      for (let index = 0; index < objects.length; index += 1000) {
        const batch = objects.slice(index, index + 1000);
        if (!batch.length) continue;
        const response = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: batch,
              Quiet: true
            }
          })
        );
        deleted += batch.length - (response.Errors?.length ?? 0);
      }

      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);

    return { deleted };
  }
}

function normalizePublicBaseUrl(value?: string): string | undefined {
  if (!value) return undefined;

  const trimmed = value.replace(/\/$/, "");
  try {
    const url = new URL(trimmed);
    if (url.hostname.endsWith(".r2.cloudflarestorage.com")) return undefined;
    return trimmed;
  } catch {
    return undefined;
  }
}
