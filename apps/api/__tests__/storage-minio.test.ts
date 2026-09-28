import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createObjectStorage, type StorageConfig } from "../src/core/storage/index.js";

const endpoint = process.env.STORAGE_INTEGRATION_ENDPOINT;
const integration = endpoint === undefined ? describe.skip : describe;
const accessKeyId = "nawasena-minio";
const secretAccessKey = "nawasena-minio-secret";
const bucket = `nawasena-storage-${process.pid}-${Date.now()}`;
const key = "resumes/user-integration/resume-integration/cv.pdf";

integration("ObjectStorage + MinIO", () => {
  const config: StorageConfig = {
    endpoint: endpoint!,
    region: "us-east-1",
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle: true,
    maxUploadBytes: 1_024,
    presignTtlSeconds: 5,
  };
  const client = new S3Client({
    endpoint,
    region: config.region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  beforeAll(async () => {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  });

  afterAll(async () => {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    client.destroy();
  });

  it("roundtrip privat: unsigned 403, presign berhasil, lalu kedaluwarsa", async () => {
    const storage = createObjectStorage(config);
    const body = new TextEncoder().encode("PDF integration PR-062");
    await storage.upload({ key, body, contentType: "application/pdf" });

    const unsigned = await fetch(`${endpoint}/${bucket}/${key}`);
    expect(unsigned.status).toBe(403);

    const signed = await storage.presignDownload({ key, expiresInSeconds: 1 });
    const beforeExpiry = await fetch(signed.url);
    expect(beforeExpiry.status).toBe(200);
    expect(new Uint8Array(await beforeExpiry.arrayBuffer())).toEqual(body);

    await new Promise((resolve) => setTimeout(resolve, 2_100));
    const afterExpiry = await fetch(signed.url);
    expect(afterExpiry.status).toBe(403);
  }, 10_000);
});
