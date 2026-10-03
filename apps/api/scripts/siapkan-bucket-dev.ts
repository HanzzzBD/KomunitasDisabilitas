// Provisioning bucket MinIO lokal (PR-064a). Hanya untuk development/test.
//
// `core/storage` sengaja tidak punya operasi create/list bucket (PR-062), jadi
// bucket dibuat di luar aplikasi. Tanpa langkah ini upload PDF pertama di stack
// dev gagal `NoSuchBucket`. Image `minio/mc` sudah tidak dipublikasikan di
// Docker Hub, maka provisioning memakai SDK S3 yang sudah menjadi dependensi.
//
// Idempoten: bucket yang sudah ada dibiarkan. Menolak staging/production — di
// sana bucket B2 dibuat operator, bukan skrip dev.
/* eslint-disable no-console -- script CLI: output ke console adalah antarmukanya */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { buildStorageBucketName } from "../src/core/storage/config.js";

const LINGKUNGAN_DIIZINKAN = ["development", "test"] as const;
type LingkunganDev = (typeof LINGKUNGAN_DIIZINKAN)[number];
const PERCOBAAN = 15;
const JEDA_MS = 2_000;

function wajib(nama: string): string {
  const nilai = process.env[nama];
  if (nilai === undefined || nilai === "") {
    console.error(`${nama} belum diatur. Lihat bagian "MinIO lokal" di core/storage/README.md.`);
    process.exit(1);
  }
  return nilai;
}

const lingkungan = wajib("STORAGE_BUCKET_ENV");
if (!(LINGKUNGAN_DIIZINKAN as readonly string[]).includes(lingkungan)) {
  console.error(`Skrip ini hanya untuk development/test, bukan "${lingkungan}".`);
  process.exit(1);
}

const bucket = buildStorageBucketName(wajib("STORAGE_BUCKET_PREFIX"), lingkungan as LingkunganDev);
const client = new S3Client({
  endpoint: wajib("STORAGE_ENDPOINT"),
  region: process.env.STORAGE_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: wajib("STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: wajib("STORAGE_SECRET_ACCESS_KEY"),
  },
  forcePathStyle: true,
});

function bucketTidakAda(err: unknown): boolean {
  return err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404;
}

try {
  // MinIO bisa belum siap menerima koneksi meski container sudah "started".
  for (let ke = 1; ; ke++) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      console.log(`Bucket ${bucket} sudah ada.`);
      break;
    } catch (err) {
      if (bucketTidakAda(err)) {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`Bucket ${bucket} dibuat.`);
        break;
      }
      if (ke >= PERCOBAAN) throw err;
      await new Promise((selesai) => setTimeout(selesai, JEDA_MS));
    }
  }
} finally {
  client.destroy();
}
