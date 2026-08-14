# `app/` — perakitan

Bootstrap aplikasi: router, provider stack, error boundary. **Satu-satunya**
tempat yang boleh tahu bagaimana seluruh bagian dirangkai menjadi aplikasi.

**Masuk sini:** `App.tsx`, definisi router, provider (QueryClient, store),
error boundary tingkat aplikasi.

**Tidak masuk sini:** logika fitur, komponen presentasional, pemanggilan API.
Kalau sebuah berkas di sini tahu tentang lowongan, CV, atau lamaran, ia salah
tempat — perakitan tidak boleh punya opini tentang domain.

Rujukan: SDD §4.1.
