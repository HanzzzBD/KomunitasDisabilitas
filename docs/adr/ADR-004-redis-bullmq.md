# ADR-004 — Redis + BullMQ untuk Queue dan Cache

Status: Accepted

Tanggal: 2026-07-15 (revisi 2026-07-18: dua service Redis menggantikan dua DB index — lihat Decision)

## Context

Seluruh panggilan AI Nawasena berjalan async (ekstraksi CV, embedding, re-rank) untuk melindungi API dari latensi LLM dan menegakkan kuota free tier (SDD §7). Selain itu dibutuhkan: render PDF di background, pengiriman notifikasi, job maintenance (purge UU PDP, backup), cache penjelasan matching, penghitung kuota AI, rate limiting, dan penyimpanan OTP.

Constraint: berjalan di VPS yang sama dengan API (limit RAM 256 MB prod); antrean tidak boleh hilang karena eviction cache.

Alternatif yang dipertimbangkan:
1. **RabbitMQ/Kafka** — kemampuan messaging lebih kaya, tetapi menambah container berat dan kompleksitas yang tidak dibutuhkan pada volume job MVP.
2. **Tabel antrian di PostgreSQL (pg-boss)** — tanpa dependensi baru, tetapi tidak menyediakan cache/rate-limit/kuota yang tetap membutuhkan Redis.
3. **Redis + BullMQ** — satu sistem untuk queue + cache + counter, ekosistem Node.js matang.

## Decision

Nawasena menggunakan **Redis** sebagai cache, penghitung kuota, rate limiter, dan penyimpanan OTP, serta **BullMQ** di atas Redis sebagai job queue dengan worker terpisah. Queue dan cache memakai **dua service Redis terpisah** (`redis-cache` dan `redis-queue`): `redis-cache` dikonfigurasi `maxmemory` + `allkeys-lru`, `redis-queue` `noeviction` + AOF.

> **Revisi 2026-07-18 (PR-008):** rumusan awal "dua database Redis index terpisah dalam satu instance" tidak dapat memenuhi kebutuhan eviction yang berbeda — `maxmemory-policy` Redis berlaku per instance, bukan per DB index, dan BullMQ mensyaratkan `noeviction`. Diganti dua service Redis dalam compose yang sama; total budget RAM tidak berubah (SDD §15), klien tetap terpisah (`REDIS_URL` cache, `REDIS_QUEUE_URL` queue).

Spesifikasi tiap queue (concurrency, retry, backoff, timeout, DLQ) mengikuti SDD §16.

> **Amandemen 2026-08-31 (PR-043):** penghitung **kuota AI** tinggal di `redis-queue`, bukan di `redis-cache`. Pemisahan dua service di atas dibuat berdasarkan kebutuhan **daya tahan**, bukan berdasarkan nama beban kerjanya; `allkeys-lru` mengusir kunci sembarang saat memori menipis, dan kunci kuota yang terusir memulihkan jatah seorang pengguna sekaligus menihilkan pagu harian global — tepat pada saat trafik paling tinggi. Kalimat "Redis sebagai … penghitung kuota" di atas karenanya berarti `redis-queue` untuk kuota AI; rate limiter HTTP, OTP, dan kuota ekspor PDP (PR-022) tetap di `redis-cache`, sebab kehilangan kunci di sana hanya mengembalikan jatah kepada pemiliknya sendiri. Dua syarat mengikat penumpang non-antrean ini: prefiks `ai:kuota:` (tidak mungkin bertabrakan dengan namespace `bull:`) dan **TTL pada setiap kunci**, supaya jumlah kunci tetap terbatas dan instans `noeviction` tidak pernah terdorong menolak tulisan — yang justru akan mematikan antrean.

## Consequences

### Positif

* Satu dependensi infrastruktur untuk lima kebutuhan (queue, cache, kuota, rate limit, OTP).
* BullMQ menyediakan retry/backoff/DLQ/job-id deterministik → idempotensi job mudah dijaga.
* Worker terpisah dari API → beban Puppeteer/AI tidak memengaruhi latensi request.

### Negatif

* Redis menjadi dependensi kritis kedua setelah PostgreSQL — Redis down berarti fitur AI, notifikasi, dan rate limiting terganggu.
* Job in-flight hilang bila Redis crash — dimitigasi AOF pada `redis-queue` (cache tetap RDB default; kehilangan cache bukan masalah).
* Pemisahan service cache vs queue harus dijaga konfigurasi, bukan otomatis.

### Mitigasi

* Semua job idempotent dengan job-id deterministik → kehilangan antrean dipulihkan dengan re-enqueue dari state DB (SDD §16, §18).
* Healthcheck `/readyz` mencakup ping kedua Redis; alert Uptime Kuma saat gagal (ADR-017).
* Konfigurasi Redis (dua service, maxmemory+allkeys-lru untuk cache, noeviction+AOF untuk queue) dikodifikasi di docker-compose — bukan pengaturan manual.

## Referensi

SDD §3, §7.1, §16; PRD §8. Terkait: ADR-001, ADR-005, ADR-012.
