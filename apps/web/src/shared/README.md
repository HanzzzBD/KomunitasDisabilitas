# `shared/` — util tanpa domain

Fungsi murni dan konstanta yang **tidak tahu apa pun** tentang fitur: format
tanggal, format angka, helper string.

**Ujinya satu kalimat:** kalau sebuah berkas di sini menyebut lowongan, lamaran,
CV, atau pengguna, ia bukan `shared` — ia `features`. Folder `shared/` yang
kehilangan aturan ini berubah menjadi tempat sampah, dan isinya berhenti bisa
dipakai ulang justru karena semuanya saling bergantung.

Rujukan: SDD §4.1.
