# `features/` — logika per fitur

Satu folder per fitur: hooks, komponen khas fitur, dan pemanggilan API lewat
`@nawasena/api-client`. Inilah lapisan yang **dipakai ulang mobile** — karena
itu ia tidak boleh bergantung pada router web atau DOM secara langsung.

Folder yang direncanakan (SDD §4.1): `accessibility/`, `resume-builder/`,
`job-feed/`, `applications/`, `admin/`.

**Masuk sini:** `useDaftarLowongan()`, dialog disclosure lamaran, form CV.

**Tidak masuk sini:** komponen generik tanpa domain (Button, Dialog) — itu
milik `packages/ui`. Satu komponen dipakai dua fitur bukan alasan cukup untuk
memindahkannya ke `shared/`; alasan yang cukup adalah ia tidak punya domain
sama sekali.

Diisi mulai Phase 04. Rujukan: SDD §4.1.
