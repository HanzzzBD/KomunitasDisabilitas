# Akses Data Sensitif — Jalur Mana untuk Keperluan Apa

> **Berlaku sejak:** PR-039 (Phase 05)
> **Sumber:** SDD §8.2, ADR-007, UU PDP 27/2022
> **Kode:** `apps/api/src/modules/profiles/{repositories/profile.repository.ts,services/sensitive-access.service.ts}`

## Yang disebut "data sensitif" di sini

Dua kolom, dan hanya dua: `seeker_profiles.disability_types` dan
`seeker_profiles.accommodation_needs`. Keduanya **data pribadi spesifik** menurut
UU PDP 27/2022, disimpan sebagai ciphertext AES-256-GCM berversi (ADR-007), dan
hanya bermakna setelah didekripsi di satu tempat: lapisan service modul
`profiles`.

`consent_sensitive_at` ikut diperlakukan sebagai sensitif meski ia bukan data
disabilitas. Tanggal consent menyatakan bahwa orang ini pernah menyetujui
penyimpanan data disabilitasnya — kesimpulan yang sama dengan datanya sendiri.

## Aturan tunggal

**Pakai jalur aman, kecuali Anda bisa menuliskan alasannya.**

Bukan "kecuali Anda membutuhkannya" — kebutuhan selalu terasa nyata pada saat
menulis kode. Syaratnya adalah alasan yang bisa dibaca orang lain berbulan-bulan
kemudian, karena persis itulah yang akan ditulis ke `audit_logs` dan dibaca saat
ada yang bertanya.

## Tiga jalur

| Jalur | Bentuk yang keluar | Alasan | Audit |
|---|---|---|---|
| `sensitiveAccess.bacaAman(userId)` | `SafeProfile` — secara **tipe** tidak punya tempat bagi data disabilitas | tidak perlu | tidak ada |
| `profilesService.snapshotFor(userId)` | `SeekerProfile` lengkap, hanya untuk **pemiliknya** | tidak perlu | tidak ada (lihat di bawah) |
| `sensitiveAccess.bacaSensitif(actor, targetUserId, { purpose, reason })` | `SeekerProfile` lengkap, untuk **pihak lain** | **wajib**, 1–200 karakter | selalu |

### `bacaAman` — jalur baku

`select` di repository tidak menyebut kolom sensitif sama sekali, jadi datanya
**tidak pernah meninggalkan PostgreSQL**. Itu perbedaan yang penting dari
"membaca semuanya lalu membuang sebagian": yang tidak pernah ada di memori proses
tidak bisa bocor lewat log, pesan galat, atau heap dump.

Dipakai oleh: apa pun yang menampilkan profil tanpa perlu tahu kondisi
seseorang — daftar kandidat, kartu profil, hasil pencarian employer (Phase 12).

### `snapshotFor` — pemilik membaca dirinya sendiri

Tidak menerima id dari input mana pun; identitasnya datang dari sesi. Karena
tidak ada cara memakainya untuk membaca profil orang lain, tidak ada pembacaan
yang bisa disembunyikan di baliknya.

**Kenapa tanpa audit.** Membaca profil sendiri terjadi setiap kali halaman profil
dibuka. Satu baris per pembukaan halaman akan menenggelamkan pembacaan oleh pihak
lain — satu-satunya yang benar-benar perlu ditemukan saat menyelidiki — di bawah
ribuan baris yang tidak pernah menarik siapa pun. Dan secara hukum tidak ada
pengungkapan ketika subjek dan pembacanya orang yang sama.

Dipakai oleh: `GET /api/v1/me/profile`, kontributor ekspor PDP
(`GET /api/v1/me/export`).

### `bacaSensitif` — pihak lain

Menuntut `reason` dan menolak yang kosong **sebelum satu byte pun dibaca**;
menolak setelah membaca berarti datanya sudah keluar dan penolakannya kosmetik.
Jejaknya ditulis meski barisnya tidak ada — kalau hanya pembacaan yang berhasil
yang tercatat, menyisir siapa yang *punya* data disabilitas menjadi gratis.

**Otorisasi bukan urusan fungsi ini.** Ia menjamin bahwa pembacaan meninggalkan
jejak, bukan bahwa pemanggilnya berhak. Pemanggil wajib berada di balik
`access.role("admin")` atau setara — lihat [rbac-route-registry.md](rbac-route-registry.md).

## Tujuan dan kebijakan auditnya

`purpose` bukan label bebas: ia kunci kebijakan di
`KEBIJAKAN_AUDIT` (`sensitive-access.service.ts`), dan tipe `Record` di sana
membuat tujuan baru **tidak bisa lahir tanpa seseorang memilih jawabannya**.

| `purpose` | Kebijakan | Alasan |
|---|---|---|
| `selfService` | `tanpaCatatan` | Subjek dan pembacanya orang yang sama. **Tidak bisa disebut** lewat `bacaSensitif` — dikeluarkan oleh tipe, bukan oleh pemeriksaan. |
| `support` | `perPanggilan` | Operator membuka profil satu orang. Inilah pembacaan yang paling perlu bisa dipertanggungjawabkan. |
| `disclosure` | `perPanggilan` | Pengungkapan ke pemberi kerja saat melamar (PR-075). Satu peristiwa, satu subjek, satu baris. |
| `matching` | `agregat` | Pencocokan membaca ribuan profil per batch. Satu baris per profil bukan audit melainkan salinan tabel. |

### Bentuk baris agregat

Satu baris per **hari × pelaku**, bukan per profil:

* `entityId: null` — barisnya berbicara tentang satu job, bukan satu orang.
  Menunjuk salah satu subjek secara sembarang akan terbaca sebagai "profil
  inilah yang dibaca".
* `meta.count` — berapa profil dibaca sepanjang periode itu.
* `meta.reason` dan `requestId` diambil dari panggilan **pertama** di ember:
  keduanya menjawab "apa yang memulai pembacaan massal ini", dan jawaban itu
  tidak berubah karena batch-nya panjang.

Ember ditulis saat harinya berganti, atau saat `flushAudit()` dipanggil (hook
shutdown di `boot.ts`). **Batasnya:** ember hidup di memori, jadi proses yang
dibunuh paksa kehilangan hitungan yang belum tertulis. Yang hilang adalah
**angka**, bukan kejadian — job matching meninggalkan jejaknya sendiri di log
job. Menjadikannya tahan-mati menuntut tabel penampung tersendiri, dan itu tidak
sebanding untuk mengamankan sebuah hitungan.

## `reason` adalah satu-satunya teks bebas di `audit_logs`

Seluruh `meta` audit lain memakai enum atau angka, justru supaya PII tidak punya
jalan masuk ([audit-action-catalog.md](audit-action-catalog.md)). `reason`
adalah pengecualian yang disengaja: pertanyaan yang diajukan orang saat
menyelidiki pembacaan data disabilitas bukan "kapan" melainkan **"kenapa"**, dan
enum tertutup atas alasan hanya akan menghasilkan satu nilai `lainnya` yang
dipakai untuk segalanya.

Harganya ditanggung operator:

> **Jangan tulis nama, nomor, email, atau kondisi seseorang di dalam `reason`.**
> Tulis nomor tiket dan apa yang sedang dikerjakan — `"tiket #4821 — akomodasi
> tidak muncul di lamaran"`, bukan `"cek disabilitas Budi 0812…"`.

Batas 200 karakter menahan panjangnya. Sisanya adalah pelatihan operator, bukan
validasi — dan itu dinyatakan di sini supaya menjadi keputusan yang diketahui,
bukan celah yang ditemukan.

## Menambah pemanggil baru

`findSensitiveByUserId` di repository dijaga
`apps/api/__tests__/akses-sensitif-jangkauan.test.ts`: hanya berkas yang
terdaftar boleh menyentuhnya. Berkas baru yang memanggilnya membuat **build
merah** sampai seseorang memutuskan — dan keputusan yang benar hampir selalu
"pakai `bacaSensitif`", bukan "tambahkan ke daftar".
