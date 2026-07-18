# Prisma — Konvensi Migrasi Incasif

Prisma adalah **pemilik migrasi** (SDD §6.2); `schema.prisma` = sumber kebenaran struktur DB (CLAUDE.md §12). Perubahan raw SQL wajib review.

## Perintah

```bash
# Dev lokal (compose harus hidup; Postgres di host port 5433)
pnpm --filter @incasif/api db:migrate    # buat + apply migrasi baru
pnpm --filter @incasif/api db:reset     # reset dari nol + seed (destruktif!)
pnpm --filter @incasif/api db:seed      # seed idempotent saja
```

`DATABASE_URL` diambil dari environment (lihat `.env.example`).

## Konvensi

1. **Raw SQL untuk fitur di luar dukungan Prisma** — ditulis **di file migrasi yang sama** setelah bagian generated, diberi header komentar. Contoh yang sudah ada (migrasi 01): unique **parsial** (`WHERE deleted_at IS NULL`), indeks **BRIN**. Menyusul: `vector(768)` + HNSW (PR-010), FTS GIN (PR-011).
2. **`down.sql` wajib per folder migrasi** — Prisma tidak meng-generate down; setiap folder `prisma/migrations/<nama>/` berisi `down.sql` manual yang **diuji up→down→up** sebelum PR di-merge. (Keputusan implementasi PR-009 untuk memenuhi AC "down teruji" + CLAUDE.md §5.4; bukan ADR.)
3. **Backward-compatible satu versi** (CLAUDE.md §5.4) — kode versi N harus jalan di skema N+1: tambah kolom = nullable/ber-default; rename/drop = dua migrasi terpisah (expand → contract) di PR berbeda.
4. **PK uuid v7 di-generate aplikasi** (`core/ids`) — bukan default DB (`gen_random_uuid()` = v4, tidak sortable). Jangan tambahkan `@default(dbgenerated(...))` pada kolom id.
5. **Semua timestamp `timestamptz`** — `DateTime @db.Timestamptz(6)`; jangan `timestamp` polos.
6. **FK `onDelete` eksplisit** per relasi (SDD §14): profil/token → `Cascade` dari users; tabel riwayat (applications→jobs nanti) → `Restrict`. `audit_logs` SENGAJA tanpa FK — append-only, tahan penghapusan akun.

## Jebakan yang harus diingat

- **Unique phone/google_id bersifat PARSIAL (aktif saja).** Bisa ada baris soft-deleted dengan phone sama. Query login/lookup **WAJIB** filter `deleted_at IS NULL` — `findUnique` Prisma tidak bisa dipakai untuk phone; gunakan `findFirst({ where: { phone, deletedAt: null } })`.
- `audit_logs` dilarang UPDATE/DELETE dari aplikasi (append-only). Enforcement grant DB role = PR-097; sampai itu, disiplin kode + review.
- Seed (`seed.ts`) harus **idempotent** — dipanggil otomatis oleh `migrate reset` (CI melakukannya setiap run).
