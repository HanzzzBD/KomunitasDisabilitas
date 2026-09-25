# Object storage

`core/storage` adalah satu-satunya adapter S3-compatible untuk Cloudflare R2
(production) dan MinIO (dev/CI). Permukaannya sengaja hanya memiliki `upload`
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
API untuk membuat atau mendaftar bucket. R2 production wajib memakai endpoint
HTTPS; MinIO lokal memakai `STORAGE_FORCE_PATH_STYLE=true`.

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

Jalankan `docker compose -f docker-compose.dev.yml up minio`, buat bucket yang
sesuai environment melalui provisioning/console MinIO, lalu gunakan:

```dotenv
STORAGE_ENDPOINT=http://127.0.0.1:9000
STORAGE_ACCESS_KEY_ID=nawasena-minio
STORAGE_SECRET_ACCESS_KEY=nawasena-minio-secret
STORAGE_BUCKET_PREFIX=nawasena
STORAGE_BUCKET_ENV=development
STORAGE_REGION=us-east-1
STORAGE_FORCE_PATH_STYLE=true
```

Kredensial di atas khusus localhost dan tidak boleh dipakai di staging atau
production.
