# ADR-018 — PostgreSQL FTS + pg_trgm untuk Pencarian Lowongan

Status: Accepted

Tanggal: 2026-07-15

## Context

Pencari kerja mencari lowongan dengan teks bebas + filter faceted (lokasi, work mode, akomodasi) — PRD FR-4.3. Target katalog tahun pertama hanya ~150 lowongan aktif terverifikasi (PRD §15). Pencarian harus tetap berfungsi penuh saat kuota AI habis (graceful degradation).

Constraint: satu VPS; setiap sistem tambahan menambah RAM dan beban sinkronisasi data.

Alternatif yang dipertimbangkan:
1. **Meilisearch self-host** — typo-tolerance dan faceting terbaik, tetapi +1 container (200–500 MB RAM) dan +1 pipeline sinkronisasi untuk katalog seukuran ini.
2. **Elasticsearch/OpenSearch** — kebutuhan RAM 2 GB+ tidak masuk akal untuk satu VPS 8 GB.
3. **PostgreSQL FTS + pg_trgm** — nol sistem tambahan.

## Decision

Pencarian lowongan Nawasena menggunakan **PostgreSQL Full-Text Search** (GIN index atas `to_tsvector` pada title + description) dikombinasikan **pg_trgm** (GIN trigram pada title) untuk toleransi typo, plus filter faceted melalui indeks btree/GIN yang ada (SDD §6.3). Pencarian adalah jalur non-AI kelas satu: berfungsi identik saat kuota AI habis. **Meilisearch** adalah jalur upgrade dengan pemicu terukur: katalog > 10.000 lowongan atau latensi FTS melampaui ambang (SDD §19); sinkronisasinya kelak memakai event `job.published` yang sudah ada.

## Consequences

### Positif

* Nol infrastruktur tambahan; pencarian dan data selalu konsisten (satu sumber).
* Kombinasi FTS + trigram menangani bahasa Indonesia dan typo secara memadai untuk skala katalog MVP.
* Query search dapat digabung filter faceted dan RBAC dalam satu SQL.

### Negatif

* Kualitas relevansi (ranking, sinonim) di bawah engine pencarian khusus.
* Konfigurasi FTS bahasa Indonesia bawaan PostgreSQL terbatas (tanpa stemming Indonesia penuh).
* Pada katalog sangat besar, FTS bersaing resource dengan beban transaksional.

### Mitigasi

* Katalog MVP (~150 aktif) jauh di bawah ambang masalah; relevansi dibantu AI re-rank di feed matching (jalur terpisah dari search).
* Kamus sinonim sederhana (tsearch dictionary) ditambahkan bila kebutuhan terbukti dari query log.
* Pemicu upgrade ke Meilisearch terdefinisi dan terpantau via metrik latensi (ADR-017, SDD §19).

## Referensi

PRD FR-4.3, §15; SDD §6.3, §19. Terkait: ADR-003, ADR-013.
