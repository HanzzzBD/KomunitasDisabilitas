Kamu adalah AI coding agent yang mengerjakan backlog Incasif (lihat CLAUDE.md untuk context lengkap).

## Tugas

Kerjakan PR-008 - Docker Compose Dev + Health Endpoints dari phase 1 (Foundation).

## Sebelum Mulai

1. Baca CLAUDE.md (arsitektur, konvensi, module boundaries, tech stack).
2. Baca file phase terkait: docs/implementation/phase-01-foundation.md
   - Fokus pada bagian Objective/Scope/Technical Notes/Acceptance Criteria untuk PR-008.
3. Pastikan semua PR di kolom Dependencies untuk PR-008 sudah merged:
   Dependencies: PR-007
   - Jika ada yang belum merged, STOP dan laporkan ke saya sebelum lanjut.
4. Cek ADR relevan jika Technical Notes merujuk ke ADR tertentu (docs/adr/).

## Scope PR Ini

- `docker-compose.dev.yml` + `apps/api/Dockerfile` (dev target)
- `infra/pg-init.sql` (CREATE EXTENSION vector)
- Redis config dua DB index; klien terpisah
- Endpoint health (liveness) & ready (ping DB+Redis)

## Konvensi Wajib (Global — CLAUDE.md §5 & README.md)

- Lint boundaries lolos (`eslint-plugin-boundaries`) — no cross-module repo import, no direct AI SDK import di luar core/ai.
- Validasi input pakai zod dari `packages/schemas`.
- Error envelope `{code, message, hint}` dalam Bahasa Indonesia sederhana.
- Kalau ada perubahan frontend: harus lolos a11y gate (axe-core + jsx-a11y + Lighthouse), WCAG 2.2 AA.
- Panggilan LLM hanya lewat AI Gateway (`core/ai`), hormati rate limit per-user.
- Tidak boleh ada PII/secret di log atau kode.
- Struktur modul baru ikuti pola router → controller → service → repository (lihat CLAUDE.md §5.3).
- Migrasi Prisma harus backward-compatible satu versi; kalau destruktif, sertakan & uji down-migration.
- Target ukuran PR < 500 LOC. Kalau scope ternyata lebih besar, beri tahu saya dan usulkan pemecahan.

## Yang Harus Dihasilkan

1. Implementasi sesuai Scope + Technical Notes di file phase.
2. Unit test (Vitest) untuk logic baru.
3. Update Acceptance Criteria checklist di file phase — tandai mana yang terpenuhi.
4. Jalankan & laporkan hasil: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
5. Tulis log implementasi di file terpisah sesuai CLAUDE.md §1:
   `docs/implementation/log/implementation_log_phase01.md` (append entry baru untuk PR-008, jangan menyisipkannya ke file phase), berisi:
   - Ringkasan hasil PR
   - Scope yang selesai vs yang tidak (dan kenapa)
   - Keputusan teknis penting yang diambil
   - Risiko yang ditemukan
   - Next steps / follow-up yang direkomendasikan
6. Deskripsi PR (untuk PR description di GitHub): what, why, acceptance criteria yang terpenuhi.

## Batasan

- Jangan mengerjakan scope PR lain di luar PR-008, meskipun terlihat terkait — catat di "Out of Scope" jika perlu.
- Jangan mengubah keputusan arsitektur (ADR) tanpa konfirmasi eksplisit dariku.
- Kalau menemukan ambiguitas antara PRD/SDD dan file phase, file phase yang jadi acuan.

## Output yang Diharapkan dari Kamu Sekarang

Sebelum menulis kode: ringkas rencana kerja (file yang akan disentuh/dibuat, urutan langkah), lalu tunggu konfirmasiku — kecuali aku bilang "langsung kerjakan".