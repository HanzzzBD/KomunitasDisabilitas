# Checklist NVDA & 3G — PR-068 AI CV Builder (chat)

Tanggal: 2026-09-29
Target: Chrome/Edge terbaru + NVDA, Windows; DevTools throttling "Slow 3G"
Route: `/cv` (pintu masuk) dan `/cv/chat`
Prasyarat: API + worker berjalan dengan kunci AI yang sah (lihat U-26: Gemini bisa
lambat; Groq menjawab bila Gemini melewati 15 detik).

Yang SUDAH dibuktikan otomatis (e2e `cv-chat.spec.ts`, axe registry halaman):
pengumuman masuk wilayah `aria-live="polite"` per kalimat, fokus tetap di kotak ketik
setelah Ctrl+Enter, mode formulir tanpa `role="alert"`, sambung ulang dengan
`Last-Event-Id`, dan nol pelanggaran axe. Yang di bawah ini hanya bisa dibuktikan
MANUSIA dengan pembaca layar sungguhan.

## Pintu masuk

- [ ] Di `/cv`, "Buat dengan chat AI" dan "Buat CV dari profil" sama-sama tercapai dengan `Tab` dan dibacakan jelas bedanya.
- [ ] Membuka `/cv/chat` mengumumkan heading tingkat 1 "Buat CV lewat obrolan".
- [ ] Salam pembuka pewawancara terbaca saat menelusuri daftar "Percakapan" (daftar bernomor, pembicara disebut).

## Menjawab dan mendengar jawaban (AC PR-068)

- [ ] Kotak "Jawaban Anda" membacakan label dan bantuan (batas karakter, Ctrl+Enter).
- [x] Setelah Ctrl+Enter, NVDA mengumumkan "Pewawancara sedang mengetik…" SEKALI, tanpa memindahkan fokus.
- [x] Jawaban AI dibacakan **per kalimat**, tidak terpotong per kata, dan tidak diulang dua kali (pratinjau yang mengalir disembunyikan dari pembaca layar).
- [x] Fokus TETAP di kotak ketik sepanjang jawaban mengalir — pengguna bisa langsung mengetik jawaban berikutnya.
- [ ] Menekan tombol "Kirim" dengan mouse/Enter tidak menjatuhkan fokus ke awal halaman.
- [ ] Menelusuri daftar "Percakapan" sesudahnya membacakan jawaban tersimpan (versi rapi), bukan pratinjau.

## Sisa kuota & degradasi

- [ ] Kalimat "Sisa pesan hari ini: X dari 30 …" terbaca dan angkanya berkurang satu setelah tiap jawaban.
- [ ] Saat kuota habis: heading "Chat AI sedang tidak bisa dipakai" + pesan jujur dibacakan (bukan nada galat), tombol "Isi CV lewat formulir" langsung tercapai, transkrip tetap bisa dibaca.
- [ ] Tidak ada perpindahan halaman otomatis; hanya tombol yang memindahkan.

## Finalize

- [ ] "Selesai dan buat draf CV" mengumumkan status "Draft CV sedang dibuat…".
- [ ] Saat selesai, status "Draft CV Anda siap…" diumumkan dan tautan "Buka draft CV" tercapai dengan `Tab`.
- [ ] Saat gagal, pesan "Draft CV belum berhasil dibuat. Jawaban Anda tetap tersimpan…" diumumkan dan kedua jalan keluar tersedia.

## Jaringan lambat / putus (Slow 3G)

- [ ] Dengan throttling Slow 3G, token tetap mengalir bertahap (tidak menumpuk lalu muncul sekaligus — cek `X-Accel-Buffering`/proxy).
- [x] Mematikan jaringan sebentar di tengah jawaban lalu menyalakannya: "Sambungan terputus. Menyambung kembali…" tampil, jawaban berlanjut TANPA kalimat dobel.
- [ ] Mematikan jaringan > 1 menit: halaman memberi pesan jujur; memuat ulang halaman menampilkan jawaban yang sudah tersimpan.

## Tampilan sempit

- [ ] Lebar 320 px dan pembesaran 200%: tanpa gulir mendatar; gelembung percakapan membungkus teks panjang.
- [ ] Target sentuh tombol ≥ 44×44 px.

## Catatan hasil manual

### 2026-09-29 — otomatis dengan NVDA nyata (PR-068c)

NVDA 2026.1.1 (synth `silence`, log IO: yang dicatat adalah ucapan NVDA yang sebenarnya), Chrome for
Testing (Playwright, headed), stack nyata: API + Gemini/Groq sungguhan lewat proxy Vite. Harness:
`apps/web/verifikasi/chat-nyata.verifikasi.ts`. Kotak yang dicentang di atas berasal dari run ini.

* **A. Normal.** Ucapan NVDA sesudah Ctrl+Enter: "Pewawancara sedang mengetik…" satu kali, lalu
  jawabannya. Tiap kalimat terucap **tepat satu kali**. Tidak ada ucapan perpindahan fokus sesudah
  pesan dikirim; fokus tetap di kotak ketik. Jawaban tersimpan dalam 2,0 dtk.
  *Catatan:* jawaban sependek ini tiba dalam satu potongan, jadi NVDA mengucapkan kedua kalimat
  sebagai satu ucapan. Pemecahan per kalimat saat token datang bertahap dibuktikan e2e, bukan run ini.
  Pada run pertama, "sedang mengetik" tidak terucap karena jawaban datang lebih dulu. Ini soal
  waktu, bukan galat.
* **B. Slow 3G** (CDP: latensi 2 dtk, ~400 kbps). Jawaban tersimpan dalam 3,0 dtk dan fokus
  tetap di kotak ketik. Kotak "token mengalir bertahap" **belum** dicentang: throttling CDP tidak
  memperlambat badan aliran per potongan, jadi hal itu tidak teramati di sini.
* **C. Putus di tengah.** Browser hanya menerima 2 dari 6 event, lalu jaringan dimatikan 2,5 dtk.
  NVDA membacakan peringatan offline aplikasi, lalu "sedang mengetik", lalu jawaban lengkap. Klien
  menyambung ulang ke `/stream` nyata dengan `Last-Event-Id: 2`. Hasilnya **0 giliran dobel**,
  6 giliran bertambah, tiap kalimat terucap satu kali, dan fokus tetap di kotak ketik.

**Masih terbuka (butuh manusia):** pintu masuk, kuota/degradasi, finalize, putus > 1 menit,
tampilan sempit. Kotak yang tidak dicentang di atas ada di utang U-28.
