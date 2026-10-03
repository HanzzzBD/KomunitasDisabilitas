# Implementation Log — Phase 14 (SignBridge v1 & Simplify)

> Catatan per PR yang selesai di Phase 14. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---

## PR-084 — SignBridge BE — Kamus Video (sign_videos)

> **Phase:** [14 - SignBridge v1 & Simplify](../phase-14-signbridge-simplify.md#pr-084---signbridge-be--kamus-video-sign_videos)
> **Tanggal:** 2026-10-03
> **Status:** Selesai
> **Branch:** `pr-084-signbridge-kamus-api` → `phase-14-signbridge-simplify` (branch phase dibuat dari `main` sesudah `phase-13 → main`, PR #195)

### Ringkasan hasil

Modul resmi baru `modules/signbridge` (ADR-010 v1): CRUD admin kamus video BISINDO dengan lifecycle
draft → published, dan pencarian publik `GET /api/v1/sign-videos?query&category&limit`. Publish
**ditolak 422** bila video, caption (.vtt), atau transkrip belum ada. Aturan ini ditegakkan di
service dan sekali lagi oleh CHECK di DB. Hanya entri published yang tampil publik, dengan URL
media presigned (bucket privat, ADR-020).

### Keputusan owner (AskUserQuestion, 2026-10-03)

Dokumen PR menulis "Database Changes: tidak ada", padahal tabel PR-011 belum punya kolom caption
maupun transkrip, dan `video_url NOT NULL` memaksa video ada sebelum draft lahir.

1. **Migrasi aditif** — `caption_key` (berkas .vtt di storage, dibaca `<track>` PR-086) +
   `transcript` (teks di DB).
2. **Kolom media = key storage, nullable selama draft** — `video_url`/`thumbnail_url` di-rename
   menjadi `video_key`/`thumbnail_key`. Alurnya: buat draft → presign PR-085 memakai id draft →
   PUT key → publish. URL presigned dibuat saat dibaca.
3. **Kategori = daftar tertutup di zod** (`salam, perkenalan, wawancara, tempat_kerja, akomodasi,
   waktu, angka, umum`), kolom DB tetap `text`. Kategori baru cukup lewat review skema, tanpa
   migrasi.

### Scope selesai

**DB — migrasi 23 `sign_video_media`** (ditulis tangan, U-15): rename dua kolom, `video_key` DROP
NOT NULL, tambah `caption_key` + `transcript`, CHECK `sign_videos_terbit_lengkap` (published ⇒
video + caption + transkrip tidak kosong). `down.sql` menghapus draft tanpa video (kolom lama NOT
NULL). Rename aman karena belum ada kode yang membaca tabel ini.

**Kontrak (`packages/schemas/src/signbridge.ts`, skeleton PR-004 diisi)** — kategori, status,
create/update (strict, `null` mengosongkan), admin/public view, query pencarian (limit bawaan 24,
maks 50). OpenAPI: 4 path, tag `signbridge`.

**API — `modules/signbridge`** (router → controller → service → repository):

* `GET /sign-videos` (publik) — FTS `to_tsvector('indonesian', phrase)` (ekspresi sama persis
  dengan indeks `sign_videos_phrase_fts`) ATAU ILIKE sebagian (wildcard di-escape) agar ketikan
  yang belum jadi kata utuh tetap menemukan. Urutan: `ts_rank` lalu frasa. Respons TIDAK memuat
  key mentah — hanya `videoUrl`/`captionUrl`/`thumbnailUrl` presigned + `mediaExpiresAt`
  (yang paling awal). Storage belum diatur → 503 `BELUM_SIAP` (pola PDF CV).
* `GET/POST /admin/sign-videos`, `PUT /admin/sign-videos/:id`, `POST .../:id/publish` —
  `access.role("admin")`. Key media wajib `sign-videos/{id ini}/{berkas}` dengan ekstensi sesuai
  jenis (video `.mp4/.webm`, caption `.vtt`, thumbnail `.jpg/.jpeg/.png/.webp`), lalu lolos
  `assertStorageKey`. Key milik entri lain/domain lain → 422. PUT pada entri published yang
  mengosongkan video/caption/transkrip → 422, supaya tidak ada jalan pintas "terbitkan dulu, hapus
  caption kemudian". Publish ganda → 409.
* Audit `ADMIN_RESOURCE_CHANGED` (`create`/`update`/`publish`), entitas `signbridge.sign_video`.
* Kode error baru: `VIDEO_ISYARAT_TIDAK_DITEMUKAN` (404), `VIDEO_ISYARAT_BELUM_LENGKAP` (422,
  `hint` menyebut yang kurang), `MEDIA_VIDEO_ISYARAT_TIDAK_VALID` (422),
  `VIDEO_ISYARAT_SUDAH_TERBIT` (409).
* `boot.ts`: adapter storage dirakit sekali dan dipakai bersama PDF CV dan kamus.

### Acceptance Criteria

* [x] Publish tanpa caption/transkrip → 422 (server-enforced) — unit + integrasi; CHECK DB
  menolak jalur lain.
* [x] Pencarian frasa menemukan video (FTS test) — `signbridge-db.test.ts` (kata utuh beda huruf
  besar/urutan, dan ketikan sebagian).
* [x] Hanya published tampil publik — draft dengan frasa yang sama tidak muncul.
* [x] Kategori tervalidasi — 400 di query publik dan body admin.
* [x] Audit publish — baris `ADMIN_RESOURCE_CHANGED {operation:"publish"}` diverifikasi di DB.

### Verifikasi

* `pnpm lint`, `pnpm typecheck`, `check:openapi` hijau.
* `signbridge.test.ts` (22 unit) + `signbridge-db.test.ts` (6 integrasi, Postgres nyata) +
  `openapi-parity` + `http-errors` (snapshot katalog diperbarui) hijau.
* `pnpm exec turbo run test --concurrency=1` — lihat badan PR.

### Risiko & catatan

* Konten bergantung juru bahasa (PRD §17). Modulnya siap; konten masuk lewat program hibah/CSR.
* **Tidak ada unpublish/hapus** — di luar scope dokumen. Koreksi konten terbit lewat PUT (tetap
  harus lengkap). Bila tim konten butuh menarik entri, tambahkan di PR-085.
* Pencarian publik tanpa pagination (maks 50). Cukup untuk kamus ratusan entri; tambahkan cursor
  bila kamus tumbuh jauh.
* URL presigned berumur ≤ 15 menit (`STORAGE_PRESIGN_TTL_SECONDS`). PR-086 mengambil ulang daftar
  bila `mediaExpiresAt` lewat.
* CORS bucket (presigned PUT) baru dibutuhkan PR-085 (README core/storage langkah 5).

### Next steps

* **PR-085** — `POST /admin/sign-videos/presign` (id draft, batas tipe & ukuran) + UI unggah.
  Key yang dihasilkan presign harus lolos `mediaKeySah`.
* **PR-086** — halaman kamus publik + pemutar (caption default menyala, transkrip di bawah).

---

## PR-085a — Admin Sign-Videos — Presign Unggah (API)

> **Phase:** [14 - SignBridge v1 & Simplify](../phase-14-signbridge-simplify.md#pr-085---admin-sign-videos-fe--upload)
> **Tanggal:** 2026-10-03
> **Status:** Selesai (bagian API; UI menyusul di PR-085b)
> **Branch:** `pr-085a-presign-api` → `phase-14-signbridge-simplify`

### Ringkasan hasil

Browser admin kini bisa mengunggah media kamus **langsung ke bucket** lewat URL PUT presigned,
tanpa melewati API. Tipe dan ukuran dibatasi per jenis. Ukuran **ikut ditandatangani**, jadi
berkas yang lebih besar dari izin ditolak provider. Key baru disimpan hanya bila objeknya sudah
ada di bucket dengan ukuran dan tipe yang sah. Admin juga bisa **menarik** entri terbit kembali
ke draft.

### Keputusan owner (AskUserQuestion, 2026-10-03)

1. **Batas ukuran:** video mp4/webm ≤ 50 MB, caption `text/vtt` ≤ 200 KB, thumbnail
   jpg/png/webp ≤ 1 MB. Satu sumber: `SIGN_VIDEO_MEDIA` di `@nawasena/schemas`, dipakai server
   dan formulir web.
2. **Unggah per berkas** — tiap slot punya progres dan coba-lagi sendiri (diterapkan di PR-085b).
3. **Tarik ke draft** (`unpublish`) masuk PR ini. Hapus permanen belum.
4. **Dipecah:** PR-085a (API) + PR-085b (UI), preseden PR-083a/b.

### Scope selesai

**`core/storage`** — dua operasi baru, kebijakan diperiksa sebelum provider disentuh:

* `presignUpload({key, contentType, contentLength, maxBytes?})` → `{url, method:"PUT", headers,
  expiresAt}`. `signableHeaders` + `unhoistableHeaders` = `content-type`, `content-length`.
  Tanpa itu presigner AWS SDK mengangkat header ke query dan ukuran tidak terikat.
* `stat(key)` → `{size, contentType} | null` (HeadObject; 404 → `null`).
* README diperbarui: permukaan adapter, kebijakan URL unggah.

**API `modules/signbridge`:**

* `POST /admin/sign-videos/presign` `{videoId, kind, contentType, size}` → izin unggah. Tipe dan
  ukuran disaring zod (400). Key selalu baru, `sign-videos/{id}/{kind}-{uuidv7}.{ext}`, supaya
  unggahan tidak pernah menimpa media yang sedang tayang. Publik baru melihatnya setelah key
  disimpan (audit `update`).
* `PUT /admin/sign-videos/:id` — key media yang **berubah** diverifikasi lewat `stat`: belum ada
  → 422 `BERKAS_VIDEO_ISYARAT_TIDAK_ADA`; ukuran/tipe tidak sah → 422
  `MEDIA_VIDEO_ISYARAT_TIDAK_VALID`; storage absen → 503.
* `POST /admin/sign-videos/:id/unpublish` — published → draft, audit
  `ADMIN_RESOURCE_CHANGED {operation:"unpublish"}` (nilai enum baru). Draft → 409
  `VIDEO_ISYARAT_BELUM_TERBIT`.
* OpenAPI: 2 path baru, deskripsi PUT diperbarui.

### Acceptance Criteria (bagian API)

* [x] Validasi tipe/ukuran di presign (server) — zod + `presignUpload` + `stat` saat simpan.
* [ ] Upload video+vtt+thumbnail → publish end-to-end (MinIO) — PUT presigned nyata ke MinIO
  sudah terbukti (`storage-minio.test.ts`); alur UI end-to-end di PR-085b.
* [ ] Progres `aria-live`, form keyboard-only + axe, pesan gagal + retry — PR-085b.

### Verifikasi

* `storage.test.ts` (+5), `storage-minio.test.ts` (+1, MinIO nyata: ukuran sesuai diterima,
  ukuran lain ditolak, `stat`), `signbridge.test.ts` (30), `signbridge-db.test.ts` (9).
* Lint, typecheck, `check:openapi`, suite penuh — lihat badan PR.

### Risiko & catatan

* **Objek yatim:** unggahan yang tidak pernah disimpan, atau media lama yang digantikan, tetap di
  bucket. Tidak ada operasi hapus di adapter (disengaja). Dicatat sebagai utang **U-34**.
* **CORS bucket** wajib untuk unggah dari browser di staging/produksi (README core/storage langkah
  5). MinIO dev mengizinkan semua origin secara bawaan.
* TTL URL unggah = `STORAGE_PRESIGN_TTL_SECONDS` (≤ 15 menit). Provider memeriksa kedaluwarsa saat
  permintaan dimulai, jadi unggahan 50 MB yang lambat tidak terputus di tengah.

### Next steps

* **PR-085b** — `api-client` + halaman admin "Kamus BISINDO": daftar, formulir metadata +
  transkrip, tiga slot unggah ber-progres `aria-live`, terbitkan/tarik dengan konfirmasi.
