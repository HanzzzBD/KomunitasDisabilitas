# Fixture Seed — ID Stabil untuk Dev & E2E

Sumber kode: [`fixtures.ts`](./fixtures.ts) (konstanta) + [`seed-data.ts`](./seed-data.ts) (isi). Jalankan: `pnpm --filter @nawasena/api db:seed` (atau otomatis via `db:reset` / CI).

## Aturan

1. **JANGAN mengubah UUID yang sudah ada** — E2E (PR-031+) mengunci nilai ini.
2. Menambah entitas boleh: ikuti blok penomoran di bawah, tambah di `fixtures.ts` + `seed-data.ts`, catat di sini.
3. Seed **idempotent** (upsert by ID) dan **menolak jalan di production** (guard `NODE_ENV`).
4. Kolom sensitif (`disability_types`, `accommodation_needs`) **selalu NULL di seed** — bytea ciphertext, util enkripsi = PR-013; dilarang isi plaintext.

## Blok ID (prefix `01941999-f400-7000-8000-…`)

| Blok akhiran | Entitas                               |
| ------------ | ------------------------------------- |
| `…0001`      | users: admin dev                      |
| `…0011–0014` | users: persona (Rina/Bayu/Sari/Dimas) |
| `…0101–0105` | companies (5)                         |
| `…0201–0220` | jobs (j01–j20)                        |
| `…0301–0304` | resumes per persona                   |
| `…0401–0406` | applications contoh                   |

Derivatif stabil (dari user id, ganti digit terakhir): `…e` = experience, `…d` = education, `…7..9` = skills.

## Persona (PRD §4) — semua data dummy jelas ("Fiktif", phone `+62115…`)

| Persona                         | User ID | Aksesibilitas                              | Profil singkat                           |
| ------------------------------- | ------- | ------------------------------------------ | ---------------------------------------- |
| **Rina** (Tuli, BISINDO)        | `…0011` | `prefers_sign_language`, `simple_language` | Desain grafis SMK, Jakarta, onsite       |
| **Bayu** (Netra, screen reader) | `…0012` | `screen_reader_hint`, `high_contrast`      | S1 komunikasi, Yogyakarta, remote OK     |
| **Sari** (Daksa, kursi roda)    | `…0013` | `large_touch_targets`                      | Keuangan 5 th, Bandung, remote/hybrid    |
| **Dimas** (Autisme)             | `…0014` | `simple_language`, `reduce_motion`         | D3 informatika, QA/data entry, remote OK |

## Jobs (j01–j20) — matriks variasi untuk test matching

- **work_mode**: onsite (j01, j10, j11, j16, j17, j18), hybrid (j02, j07, j08, j12, j19), remote (sisanya).
- **Akomodasi** (taksonomi): `akses_kursi_roda`, `ramah_screen_reader`, `wawancara_via_teks`, `jam_kerja_fleksibel`, `ruang_kerja_tenang`, `juru_bahasa_isyarat`.
- **Status**: j18, j19 = `draft`; j20 = `closed`; sisanya `published`.
- Relevansi per persona: j01–j03 (Rina), j04–j07 (Bayu), j08–j11 (Sari), j12–j15 (Dimas), j16–j17 umum.

## Applications contoh (pipeline beragam)

| ID      | Pelamar → Job | Status    | Catatan                                                        |
| ------- | ------------- | --------- | -------------------------------------------------------------- |
| `…0401` | Rina → j01    | submitted | —                                                              |
| `…0402` | Bayu → j05    | in_review | history 1 langkah                                              |
| `…0403` | Bayu → j06    | submitted | —                                                              |
| `…0404` | Sari → j09    | **hired** | `hired_confirmed_at` terisi — **North Star** terlihat di admin |
| `…0405` | Dimas → j13   | interview | history 2 langkah                                              |
| `…0406` | Dimas → j14   | rejected  | —                                                              |
