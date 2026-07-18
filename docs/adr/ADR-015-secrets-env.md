# ADR-015 — Secrets via .env + GitHub Actions Secrets

Status: Accepted

Tanggal: 2026-07-15

## Context

Incasif menyimpan secrets kritis: kunci enkripsi field (`FIELD_KEY_*`, ADR-007), kunci backup `age`, kredensial DB, API key Gemini/Groq/Fonnte/FCM/R2, private key JWT. Kebocoran kunci enkripsi mengalahkan perlindungan data spesifik UU PDP (Risiko T8).

Constraint: satu VPS, tim 2–5 orang, tanpa anggaran layanan KMS; deploy via CI (ADR-016).

Alternatif yang dipertimbangkan:
1. **HashiCorp Vault / Infisical self-host** — rotasi dan audit terbaik, tetapi menjadi satu sistem kritikal tambahan yang harus dijaga di VPS yang sama.
2. **Secrets di image/repo** — ditolak mutlak (praktik tidak aman).
3. **`.env` per environment + GitHub Actions Secrets** — sederhana, cukup aman bila prosedur ketat.

## Decision

Secrets Incasif dikelola melalui **file `.env` per environment di VPS** (`/srv/incasif/{prod,staging}/.env`, `chmod 600`, owner deploy-user, di luar git) dan **GitHub Actions Secrets** untuk kebutuhan CI. Template `.env.example` tanpa nilai berada di repo; parsing env divalidasi zod saat boot (fail-fast). Kunci enkripsi field dan kunci backup juga disimpan di password manager tim sebagai jalur disaster recovery. Prosedur rotasi terdokumentasi di runbook. Vault/Infisical adalah jalur upgrade bila tim > 5 orang atau multi-host.

## Consequences

### Positif

* Nol infrastruktur tambahan; seluruh tim memahami mekanismenya.
* Fail-fast boot mencegah aplikasi berjalan dengan konfigurasi tidak lengkap.
* DR tetap mungkin meski VPS hilang total (kunci di password manager).

### Negatif

* Tanpa audit trail akses secrets dan tanpa rotasi otomatis.
* Akses SSH ke VPS = akses semua secrets environment tersebut.
* Disiplin manual (chmod, tidak meng-copy ke tempat lain) adalah kontrol utama.

### Mitigasi

* Akses SSH dibatasi key-only + fail2ban; jumlah pemegang akses minimal (SDD §9.1).
* pino redaction memastikan nilai env tidak pernah masuk log (SDD §17).
* Skema kunci berversi (ADR-007) membuat rotasi terjadwal murah; jadwal rotasi di runbook.

## Referensi

SDD §8.5, §9.1; PRD §12. Terkait: ADR-007, ADR-016.
