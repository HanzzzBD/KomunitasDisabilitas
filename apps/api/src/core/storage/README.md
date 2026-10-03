# Object storage

`core/storage` adalah satu-satunya adapter S3-compatible untuk Backblaze B2
(staging/production, ADR-020) dan MinIO (dev/CI). Permukaannya sengaja hanya memiliki `upload`
dan `presignDownload`: bucket privat tidak pernah memiliki operasi public-list.

## Bucket per environment

Nama bucket efektif selalu `<STORAGE_BUCKET_PREFIX>-<STORAGE_BUCKET_ENV>`.
Suffix deployment dibuat eksplisit karena staging tetap memakai
`NODE_ENV=production` untuk optimasi Node, tetapi tidak boleh berbagi bucket:

| Environment   | Contoh bucket          |
| ------------- | ---------------------- |
| `development` | `nawasena-development` |
| `test`        | `nawasena-test`        |
| `staging`     | `nawasena-staging`     |
| `production`  | `nawasena-production`  |

Bucket harus dibuat oleh provisioning infrastruktur. Aplikasi tidak memiliki
API untuk membuat atau mendaftar bucket. B2 production wajib memakai endpoint
HTTPS; MinIO lokal memakai `STORAGE_FORCE_PATH_STYLE=true`.

Nama bucket B2 unik di seluruh akun B2, bukan hanya di akun kita. Bila
`nawasena-production` sudah dipakai pihak lain, ganti `STORAGE_BUCKET_PREFIX`
(mis. `nawasena-id`) — suffix environment tetap dibentuk aplikasi.

## Konvensi key

Environment tidak diulang di dalam key karena isolasinya sudah dilakukan oleh
bucket. Bentuk umum adalah:

```text
<domain>/<owner-or-scope>/<resource-id>/<artifact>
```

Domain yang diizinkan saat ini:

| Domain  | Bentuk                                     | Contoh                                 |
| ------- | ------------------------------------------ | -------------------------------------- |
| CV      | `resumes/{userId}/{resumeId}/{sha256}.pdf` | `resumes/019.../019.../a4f....pdf`     |
| BISINDO | `sign-videos/{videoId}/{artifact}`         | `sign-videos/019.../source.mp4`        |
| Backup  | `backups/{scope}/{artifact}`               | `backups/postgres/2026-09-25.dump.enc` |

Gunakan `resumePdfKey()` untuk PDF CV dan `buildStorageKey()` untuk domain
lain. Setiap segmen dibatasi ke alfanumerik, `.`, `_`, dan `-`; pemisah path,
segmen traversal, nama pengguna, email, dan PII lain tidak boleh dipakai.

## Kebijakan keamanan

- URL unduh ditandatangani paling lama 15 menit (default 5 menit).
- Ukuran diperiksa sebelum byte dikirim; batas global default 100 MiB dan
  pemanggil boleh memberi batas domain yang lebih kecil.
- Kredensial hanya datang dari environment dan tidak pernah masuk hasil fungsi.
- Objek tidak dapat diakses tanpa signature; roundtrip dan expiry dijaga oleh
  `storage-minio.test.ts` pada MinIO nyata di CI.
- Lifecycle/backup retention bukan tanggung jawab adapter ini (PR-104).

## MinIO lokal

Jalankan `docker compose -f docker-compose.dev.yml up minio`, isi nilai di bawah ke
`apps/api/.env` (worker `pnpm dev` ikut membacanya), lalu buat bucket sekali dengan
`pnpm --filter @nawasena/api storage:siapkan-bucket`. Skrip itu idempoten dan menolak
staging/production. Di stack compose penuh, service `minio-init` menjalankannya otomatis,
dan API memakai `STORAGE_PUBLIC_ENDPOINT=http://127.0.0.1:9010` agar URL presigned yang
ditandatangani untuk host `minio` tetap dapat dibuka browser di host.

```dotenv
STORAGE_ENDPOINT=http://127.0.0.1:9010
STORAGE_ACCESS_KEY_ID=nawasena-minio
STORAGE_SECRET_ACCESS_KEY=nawasena-minio-secret
STORAGE_BUCKET_PREFIX=nawasena
STORAGE_BUCKET_ENV=development
STORAGE_REGION=us-east-1
STORAGE_FORCE_PATH_STYLE=true
```

Kredensial di atas khusus localhost dan tidak boleh dipakai di staging atau
production.

## Backblaze B2 (staging/production)

Langkah operator, sekali per environment:

1. **Buat bucket** `<prefix>-<env>` dengan tipe **Private**. Jangan pernah Public:
   seluruh akses lewat URL presigned.
2. **Lifecycle rule:** pilih _Custom_ dengan _Days till hide_ kosong dan _Days till
   delete_ `30` (`daysFromHidingToDeleting: 30`, SDD §18 "30 hari versi"). Bawaan
   B2 adalah _Keep all versions_. Dengan bawaan itu, objek yang ditimpa atau dihapus
   lewat API S3 hanya disembunyikan: datanya tetap tersimpan, tetap ditagih, dan
   **tetap ada selamanya** walau pengguna meminta datanya dihapus (UU PDP, SDD §6.4).
   Retensi backup database (30 hari + bulanan×6) diatur PR-104.
3. **Application Key** khusus bucket itu (bukan Master Application Key), dengan
   kapabilitas baca + tulis. `keyID` → `STORAGE_ACCESS_KEY_ID`, `applicationKey`
   → `STORAGE_SECRET_ACCESS_KEY`. B2 hanya menampilkan `applicationKey` sekali.
4. **Endpoint** dari halaman bucket → `STORAGE_ENDPOINT`. Kosongkan
   `STORAGE_REGION`: region diturunkan dari host, dan nilai yang bertentangan
   membuat boot gagal (SigV4 menandatangani region).
5. **CORS** hanya bila browser mengunggah langsung (presigned PUT, kamus video
   SignBridge PR-085): atur _CORS rules_ bucket untuk origin web Nawasena saja,
   operasi `s3_put` dan `s3_get`. Unduhan CV tidak butuh CORS karena dibuka
   sebagai navigasi biasa.

```dotenv
STORAGE_ENDPOINT=https://s3.us-west-004.backblazeb2.com
STORAGE_ACCESS_KEY_ID=<keyID>
STORAGE_SECRET_ACCESS_KEY=<applicationKey>
STORAGE_BUCKET_PREFIX=nawasena
STORAGE_BUCKET_ENV=production
```
