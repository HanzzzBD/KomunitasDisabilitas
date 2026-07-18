# ADR-007 — AES-256-GCM untuk Enkripsi Data Sensitif

Status: Accepted

Tanggal: 2026-07-15

## Context

Data jenis disabilitas (`disability_types`) dan kebutuhan akomodasi (`accommodation_needs`) adalah **data pribadi spesifik** menurut UU PDP No. 27/2022 (PRD §12). Kebocoran data ini berdampak sangat tinggi (Risiko R4 PRD §17). Data harus tetap dapat dipakai fitur Disclosure Control dan AI Job Matching.

Constraint: kunci enkripsi tidak boleh menyentuh database, query log, maupun backup; tanpa layanan KMS berbayar.

Alternatif yang dipertimbangkan:
1. **pgcrypto (enkripsi di database)** — dapat didekripsi via SQL, tetapi kunci ikut terkirim dalam query → berisiko bocor bersama query log.
2. **Full-disk encryption saja** — melindungi dari pencurian fisik, tetapi tidak melindungi dari dump DB atau kebocoran backup.
3. **Enkripsi level aplikasi AES-256-GCM** — kunci hanya hidup di memori aplikasi.

## Decision

Field sensitif dienkripsi di **level aplikasi menggunakan AES-256-GCM** melalui util terpusat `core/crypto` (`encryptField`/`decryptField`). Ciphertext disimpan sebagai `bytea` dengan format `versi ‖ iv ‖ tag ‖ data`; kunci 32-byte berasal dari environment variable dengan skema berversi (`FIELD_KEY_V1`, `FIELD_KEY_V2`, …) untuk rotasi bertahap. Database, log (pino redaction), dan backup hanya pernah berisi ciphertext. Backup di-enkripsi lapis kedua dengan `age` memakai kunci terpisah.

## Consequences

### Positif

* Dump database, replika, dan backup aman dibaca tanpa kunci — memenuhi kewajiban perlindungan data spesifik UU PDP.
* GCM memberikan authenticated encryption — manipulasi ciphertext terdeteksi.
* Skema kunci berversi memungkinkan rotasi tanpa downtime.

### Negatif

* Field terenkripsi tidak dapat di-query SQL (WHERE/index) — filter kebutuhan akomodasi harus dievaluasi in-memory (Risiko T6 SDD §20).
* Kebocoran env `FIELD_KEY` mengalahkan seluruh proteksi (Risiko T8 SDD §20).
* Setiap titik baca/tulis field sensitif wajib melalui util terpusat — disiplin kode dibutuhkan.

### Mitigasi

* Desain matching mengevaluasi filter sensitif hanya pada top-50 kandidat di service layer — cukup untuk skala katalog MVP (SDD §6.2, §7.2).
* `.env` chmod 600, non-root, di luar git; kunci juga disimpan di password manager tim untuk DR (ADR-015).
* Repo layer menyediakan `findProfileSafe` vs `findProfileSensitive` (wajib alasan + audit log) — akses sensitif tidak bisa terjadi diam-diam (SDD §8.2).

## Referensi

PRD §12, §17 (R4); SDD §6.5, §8, §20 (T6, T8). Terkait: ADR-003, ADR-015.
