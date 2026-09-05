# Prisma — Konvensi Migrasi Nawasena

Prisma adalah **pemilik migrasi** (SDD §6.2); `schema.prisma` = sumber kebenaran struktur DB (CLAUDE.md §12). Perubahan raw SQL wajib review.

## Perintah

```bash
# 0. SEKALI SAJA: buat env lokal apps/api (Prisma TIDAK membaca .env di root!)
cp apps/api/.env.example apps/api/.env

# Dev lokal (compose harus hidup; Postgres di host port 5433)
pnpm --filter @nawasena/api db:migrate    # buat + apply migrasi baru (interaktif)
pnpm --filter @nawasena/api db:reset     # reset dari nol + seed (destruktif!)
pnpm --filter @nawasena/api db:seed      # seed idempotent saja
```

`DATABASE_URL` dibaca dari `apps/api/.env` (atau environment shell). Gejala salah lokasi/kredensial: `Environment variable not found: DATABASE_URL` (file di root — tidak terbaca) atau `P1000 Authentication failed` (menyambung ke Postgres lain, mis. Laragon di 5432 — compose dev memakai host port **5433**).

## Konvensi

1. **Raw SQL untuk fitur di luar dukungan Prisma** — ditulis **di file migrasi yang sama** setelah bagian generated, diberi header komentar. Contoh yang sudah ada (migrasi 01): unique **parsial** (`WHERE deleted_at IS NULL`), indeks **BRIN**. Menyusul: `vector(768)` + HNSW (PR-010), FTS GIN (PR-011).
2. **`down.sql` wajib per folder migrasi** — Prisma tidak meng-generate down; setiap folder `prisma/migrations/<nama>/` berisi `down.sql` manual yang **diuji up→down→up** sebelum PR di-merge. (Keputusan implementasi PR-009 untuk memenuhi AC "down teruji" + CLAUDE.md §5.4; bukan ADR.)
3. **Backward-compatible satu versi** (CLAUDE.md §5.4) — kode versi N harus jalan di skema N+1: tambah kolom = nullable/ber-default; rename/drop = dua migrasi terpisah (expand → contract) di PR berbeda.
4. **PK uuid v7 di-generate aplikasi** (`core/ids`) — bukan default DB (`gen_random_uuid()` = v4, tidak sortable). Jangan tambahkan `@default(dbgenerated(...))` pada kolom id.
5. **Semua timestamp `timestamptz`** — `DateTime @db.Timestamptz(6)`; jangan `timestamp` polos.
6. **FK `onDelete` eksplisit** per relasi (SDD §14): profil/token → `Cascade` dari users; tabel riwayat (applications→jobs nanti) → `Restrict`. `audit_logs` SENGAJA tanpa FK — append-only, tahan penghapusan akun.

## Jebakan yang harus diingat

- **Index raw SQL pada kolom `Unsupported(...)` (HNSW embedding) dianggap drift oleh Prisma** — setiap `migrate dev` berikutnya menyisipkan `-- DropIndex` untuk index tsb ke migrasi baru secara diam-diam. **SELALU periksa file migrasi generated dan hapus blok `DropIndex` nyasar itu** sebelum apply (terjadi di migrasi 02 → BRIN, migrasi 03 → HNSW seeker). Index yang bisa dideklarasikan Prisma (BRIN, btree, GIN biasa) pindahkan ke schema dengan `map:`; HNSW/FTS-expression tidak bisa — tetap raw SQL + ritual periksa-hapus.

- **Unique phone/google_id bersifat PARSIAL (aktif saja).** Bisa ada baris soft-deleted dengan phone sama. Query login/lookup **WAJIB** filter `deleted_at IS NULL` — `findUnique` Prisma tidak bisa dipakai untuk phone; gunakan `findFirst({ where: { phone, deletedAt: null } })`.
- `audit_logs` dilarang UPDATE/DELETE dari aplikasi (append-only), dan sejak **migrasi 13** larangan itu **ditegakkan database**, bukan lagi disiplin kode + review: trigger `audit_logs_append_only_baris` (UPDATE/DELETE) dan `audit_logs_append_only_truncate` (TRUNCATE — trigger baris tidak pernah menyala untuknya) melempar exception. Berlaku bagi SIAPA PUN, termasuk pemilik tabel, jadi tidak menunggu pemisahan role.
  - **Batasnya:** pemilik tabel masih bisa `ALTER TABLE ... DISABLE TRIGGER`. Ini penjaga terhadap bug aplikasi dan penghapusan tak sengaja, bukan terhadap pemilik basis data yang sudah dikuasai penyerang. **Pemisahan role least-privilege tetap PR-097.**
  - Akibat praktisnya bagi test: baris `audit_logs` TIDAK BISA dibersihkan lagi. Test yang butuh isolasi memakai id unik per jalankan, bukan `deleteMany` (lihat `audit-db.test.ts`). DB lokal dibersihkan lewat `prisma migrate reset` — sudah diverifikasi tetap jalan berikut seed-nya.
- Seed (`seed.ts`) harus **idempotent** — dipanggil otomatis oleh `migrate reset` (CI melakukannya setiap run).
