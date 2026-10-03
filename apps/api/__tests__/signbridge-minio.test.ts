// Kamus BISINDO end-to-end NYATA (PR-085, AC "upload video+vtt+thumbnail →
// publish end-to-end (MinIO)"): HTTP API + PostgreSQL + MinIO, tanpa satu pun
// palsu di jalur unggah. Browser digantikan `fetch` yang melakukan PUT ke URL
// presigned persis seperti XHR halaman admin (header izin apa adanya).
//
// Berjalan bila DB terjangkau DAN `STORAGE_INTEGRATION_ENDPOINT` diset (CI
// menyalakan MinIO untuk `storage-minio.test.ts`; lokal: http://127.0.0.1:9010).
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Writable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import type { SignVideoAdmin, SignVideoPresignResult, SignVideoPublic } from "@nawasena/schemas";
import type { AppPrisma } from "../src/core/db/index.js";
import { loadEnv } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { createObjectStorage } from "../src/core/storage/index.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import { createSessionUserSource } from "../src/modules/auth/index.js";
import { createSignbridgeModule } from "../src/modules/signbridge/index.js";
import { SESSION_KEYS } from "./helpers/session.js";

const endpoint = process.env.STORAGE_INTEGRATION_ENDPOINT;
const prisma = new PrismaClient();
const tokens = createTokenService(SESSION_KEYS);
const bucket = `nawasena-kamus-${process.pid}-${Date.now()}`;
const kredensial = { accessKeyId: "nawasena-minio", secretAccessKey: "nawasena-minio-secret" };
const s3 =
  endpoint === undefined
    ? null
    : new S3Client({
        endpoint,
        region: "us-east-1",
        credentials: kredensial,
        forcePathStyle: true,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });

let siap = false;
let api: ApiServer | null = null;
let base = "";
let adminToken = "";
const userIds: string[] = [];
const videoIds: string[] = [];

function panggil(method: string, path: string, body?: unknown) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${adminToken}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeAll(async () => {
  if (s3 === null) return;
  try {
    await prisma.$queryRaw`SELECT 1`;
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB atau MinIO tidak terjangkau — e2e kamus MinIO dilewati.");
    return;
  }
  siap = true;
  const adminId = uuidV7();
  await prisma.user.deleteMany({ where: { phone: "+628870850001" } });
  await prisma.user.create({
    data: { id: adminId, phone: "+628870850001", fullName: "UJI-PR085", role: "admin" },
  });
  userIds.push(adminId);
  adminToken = await tokens.signAccessToken({ sub: adminId, role: "admin", ver: 0 });

  const env = loadEnv({
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:9",
    REDIS_URL: "redis://127.0.0.1:9",
    REDIS_QUEUE_URL: "redis://127.0.0.1:9",
    NODE_ENV: "test",
    PORT: "0",
    HOST: "127.0.0.1",
  });
  const logger = createLogger(env, { destination: new Writable({ write: (_c, _e, cb) => cb() }) });
  const registry = createRouteRegistry({
    guardsFor: createAccessGuards({
      tokenService: tokens,
      findSessionUser: createSessionUserSource(prisma as unknown as AppPrisma),
    }).guardsFor,
  });
  const modul = createSignbridgeModule({
    prisma: prisma as unknown as AppPrisma,
    routes: registry.forModule("/api/v1"),
    auditLog: () => {},
    storage: createObjectStorage({
      endpoint: endpoint!,
      region: "us-east-1",
      ...kredensial,
      bucket,
      forcePathStyle: true,
      maxUploadBytes: 100 * 1024 * 1024,
      presignTtlSeconds: 60,
    }),
  });
  api = createServer(env, logger, { routes: (app) => app.use(modul.router) });
  assertRoutesDeclared(api.app, registry);
  base = `http://127.0.0.1:${(await api.start()).port}/api/v1`;
});

afterAll(async () => {
  await api?.stop();
  if (siap && s3 !== null) {
    await prisma.signVideo.deleteMany({ where: { id: { in: videoIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    const isi = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    for (const o of isi.Contents ?? []) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.Key }));
    }
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
  }
  s3?.destroy();
  await prisma.$disconnect();
});

describe("kamus BISINDO — unggah nyata ke MinIO → terbit → tonton", () => {
  it("video + vtt + thumbnail diunggah langsung ke bucket, diterbitkan, dan bisa diputar publik", async (ctx) => {
    if (!siap) return ctx.skip();
    const buat = await panggil("POST", "/admin/sign-videos", {
      phrase: "Terima kasih zebrakudaminio",
      category: "salam",
      transcript: "Tangan kanan di dagu, lalu bergerak maju.",
    });
    const { data: draft } = (await buat.json()) as { data: SignVideoAdmin };
    videoIds.push(draft.id);

    const berkas = {
      video: { contentType: "video/mp4", isi: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]) },
      caption: {
        contentType: "text/vtt",
        isi: new TextEncoder().encode("WEBVTT\n\n00:00.000 --> 00:02.000\nTerima kasih\n"),
      },
      thumbnail: { contentType: "image/png", isi: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
    } as const;
    const kolom = { video: "videoKey", caption: "captionKey", thumbnail: "thumbnailKey" } as const;

    for (const kind of ["video", "caption", "thumbnail"] as const) {
      const { contentType, isi } = berkas[kind];
      const res = await panggil("POST", "/admin/sign-videos/presign", {
        videoId: draft.id,
        kind,
        contentType,
        size: isi.byteLength,
      });
      expect(res.status).toBe(200);
      const { data: izin } = (await res.json()) as { data: SignVideoPresignResult };

      // Key disimpan sebelum unggahan → server memeriksa bucket dan menolak.
      const dini = await panggil("PUT", `/admin/sign-videos/${draft.id}`, {
        [kolom[kind]]: izin.key,
      });
      expect(dini.status).toBe(422);

      const put = await fetch(izin.uploadUrl, { method: "PUT", headers: izin.headers, body: isi });
      expect(put.status).toBe(200);
      const simpan = await panggil("PUT", `/admin/sign-videos/${draft.id}`, {
        [kolom[kind]]: izin.key,
      });
      expect(simpan.status).toBe(200);
    }

    expect((await panggil("POST", `/admin/sign-videos/${draft.id}/publish`)).status).toBe(200);

    const cari = await fetch(`${base}/sign-videos?query=zebrakudaminio`);
    const { data } = (await cari.json()) as { data: SignVideoPublic[] };
    const entri = data.find((v) => v.id === draft.id);
    expect(entri).toBeDefined();
    const caption = await fetch(entri!.captionUrl);
    expect(caption.status).toBe(200);
    expect(await caption.text()).toContain("Terima kasih");
    const video = await fetch(entri!.videoUrl);
    expect(new Uint8Array(await video.arrayBuffer())).toEqual(berkas.video.isi);
    expect(entri!.thumbnailUrl).not.toBeNull();
  }, 20_000);
});
