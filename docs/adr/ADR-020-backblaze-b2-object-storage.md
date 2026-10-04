# ADR-020 — Backblaze B2 sebagai object storage (menggantikan Cloudflare R2)

Status: Accepted

Tanggal: 2026-10-03

## Context

Sampai versi ini, SDD (§3, §8, §9.4, §17, §18), PRD (diagram arsitektur), ADR-006, dan
ADR-015 menetapkan **Cloudflare R2** sebagai object storage untuk PDF CV, video kamus
BISINDO, dan backup database. R2 tidak pernah punya ADR sendiri; pilihannya hanya
tersebar di dokumen-dokumen tersebut.

Implementasinya (`apps/api/src/core/storage`, PR-062) sejak awal **netral penyedia**:
satu driver `@aws-sdk/client-s3` yang dikonfigurasi lewat `STORAGE_ENDPOINT`, kredensial,
region, dan path style. Saat keputusan ini dibuat, repo belum punya deployment staging
atau production (Phase 16 belum berjalan). Yang dipakai baru MinIO lokal dan MinIO CI,
sehingga tidak ada migrasi data yang direncanakan.

Owner memutuskan memakai **Backblaze B2** (API S3-compatible) sebagai penggantinya.
Cloudflare **tetap** menjadi edge (DNS, TLS, WAF, CDN; SDD §9.4, PR-098). Yang diganti
hanya penyedia penyimpanan objek.

## Decision

Object storage staging/production memakai **Backblaze B2 melalui API S3-compatible-nya**,
lewat adapter `core/storage` yang sudah ada. MinIO tetap dipakai di dev dan CI.

Perbedaan B2 yang memengaruhi sistem, beserta penanganannya:

| Perbedaan | Penanganan |
|---|---|
| Region adalah bagian dari SigV4 dan harus sama dengan host `s3.<region>.backblazeb2.com`. R2 memakai `auto`. | `STORAGE_REGION` kini opsional. Bila kosong, region diturunkan dari host endpoint B2. Bila diisi dan bertentangan, boot gagal dengan pesan yang menyebut region yang benar. Endpoint lain memakai `us-east-1`. |
| Nama bucket unik di **seluruh** akun B2. | Dicatat di README storage dan `.env.example`: bentrok nama diatasi dengan mengganti `STORAGE_BUCKET_PREFIX`. Prefix berawalan `b2-` (dicadangkan) ditolak env. |
| Bawaan bucket adalah *Keep all versions*: hapus/timpa lewat API S3 hanya menyembunyikan objek, dan versi lamanya disimpan **selamanya**. | Lifecycle rule wajib di setiap bucket: versi tersembunyi dihapus 30 hari setelah disembunyikan (`daysFromHidingToDeleting: 30`). Angka ini sama dengan "30 hari versi" di SDD §18. Tanpa aturan ini, data yang diminta dihapus tetap tersimpan, bertentangan dengan UU PDP (SDD §6.4). |
| Kredensial berupa Application Key (`keyID` + `applicationKey`). | Pakai key yang dibatasi ke satu bucket, bukan Master Application Key. |
| CORS diatur per bucket. | Hanya untuk upload langsung dari browser (PR-085), dan hanya untuk origin web Nawasena. |

## Consequences

### Positif

* Tidak ada perubahan antarmuka `core/storage`, skema, atau pemanggil. Penggantiannya
  murni konfigurasi plus validasi region.
* Egress B2 ke Cloudflare gratis (Bandwidth Alliance). Ini sejalan dengan rencana CDN
  untuk video BISINDO di SDD §9.4, dan Cloudflare tetap ada sebagai edge.
* Validasi region di env mengubah kesalahan yang biasanya baru muncul sebagai
  `SignatureDoesNotMatch` pada upload pertama menjadi kegagalan boot yang menyebut
  nilainya.

### Negatif

* Ada satu langkah operator lagi (lifecycle rule) yang, bila terlupa, membuat
  penghapusan data hanya bersifat semu: bawaan B2 menyimpan versi lama tanpa batas. Acceptance criteria PR-104 (Phase 16) kini
  mewajibkan verifikasinya.
* Nama bucket global bisa bentrok, sehingga prefix produksi mungkin berbeda dari
  `nawasena`.
* Free tier B2 dan R2 berbeda, termasuk biaya transaksi kelas B/C. Proyeksi biaya
  (≤ Rp300rb/bulan, ADR-006) perlu dihitung ulang saat volume video diketahui.

### Dokumen terdampak

SDD, PRD (diagram), dan dokumen phase diperbarui ke B2. **ADR-006 dan ADR-015 tidak
disunting** (ADR bersifat append-only): penyebutan "R2" di sana kini dibaca sebagai
"object storage, yaitu B2 menurut ADR-020". Log implementasi lama (`docs/implementation/log/`)
dibiarkan sebagai catatan sejarah.
