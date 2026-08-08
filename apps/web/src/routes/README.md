# `routes/` — satu berkas per halaman

Tiap berkas mewakili satu URL dan hanya bertugas **menyusun** halaman dari
komponen `features/` dan `packages/ui`.

**Masuk sini:** komponen halaman, loader/route config, judul halaman.

**Tidak masuk sini:** logika bisnis. Halaman yang memuat aturan sendiri tidak
bisa diuji tanpa router dan tidak bisa dipakai ulang di mobile — padahal
`features/` justru dirancang agar bisa.

Halaman dimuat **lazy per route** (SDD §4.1). Route admin dipisah bundelnya
sendiri agar tidak ikut terunduh pengguna biasa.

Diisi mulai PR-025b. Rujukan: SDD §4.1.
