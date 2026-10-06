# Navigasi Nawasena — audit dan verifikasi

Tanggal: 6 Oktober 2026.

## Audit sebelum implementasi

- Web: React Router 7.1.1, `ruteApp` sebagai data, shell `TataLetak`, halaman fitur lazy, landing publik eager. Navigasi horizontal seeker memiliki tujuh item; admin memiliki navigasi internal tersendiri.
- Mobile: React Navigation 7, root stack bersyarat sesi/onboarding, lima tab dengan urutan Beranda/Cari/Lamaran/Profil/CV. Detail berada di root sehingga menutupi tab. Beranda memakai feed penuh atau fallback pencarian.
- URL bisnis yang harus dipertahankan: `/`, `/masuk`, `/masuk/google`, `/onboarding`, `/lowongan/*`, `/lamaran/*`, `/cv/*`, `/profil`, `/pengaturan/*`, `/notifikasi`, `/companies/:id`, `/community/*`, `/kamus/*`, `/admin/*`. Query `?lamar=1`, filter pencarian, dan return URL login merupakan bagian alur bisnis.
- Deep link native dan payload push memakai `nawasena://beranda`, `lowongan/:id`, `lamaran/:id`, `cv/:id`, `notifikasi`; antrean menunggu sesi dan onboarding. Pemetaan tujuan harus berubah tanpa mengubah payload.
- Reuse: token CSS shell dan `--touch-target-min` (44/56), `@nawasena/ui`, `@nawasena/ui-native`, `@nawasena/a11y`, store/context yang sudah ada, panel aksesibilitas, preferensi onboarding mobile, TanStack Query dan API client. Tidak memerlukan perubahan backend.
- Infrastruktur: ESLint dengan jsx-a11y, Vitest/RTL/axe pada Web, Playwright/axe pada hasil build, LHCI dengan accessibility 100; Vitest mobile untuk logika dan Jest/RNTL pada UI native shared. Pengujian screen reader perangkat tetap manual.

## Perubahan minimum yang direncanakan

1. Shell karier Web: sidebar persisten desktop, lima tautan icon+label yang menjadi bottom navigation pada viewport kecil, utility terpisah, menu akun dan aksesibilitas cepat.
2. Kelompok route Web tanpa mengganti halaman bisnis atau endpoint; alamat lama tetap bekerja, tambah alias hierarkis yang berguna, breadcrumb dan fokus perpindahan halaman.
3. Beranda personal dengan ringkasan profil/CV/lamaran dan rekomendasi terbatas; pencarian tetap pada Lowongan.
4. Native: root bersyarat Auth/Onboarding/MainTabs, tiap tab memiliki native stack; migrasi navigasi silang dan antrean tautan ke target bersarang, tab berurutan stabil.
5. Utility native di Profil/header memakai preferensi yang sudah ada; fokus judul setelah transisi dan Back mengikuti navigator.
6. Update pengujian perilaku yang terpengaruh; jalankan lint/typecheck/unit/build/Playwright/Lighthouse dan laporkan keterbatasan manual dengan jelas.

## Hasil implementasi dan pengujian

Shell seeker sekarang memiliki lima tujuan dalam urutan tetap: Beranda, Lowongan, Lamaran, CV Saya/CV, Profil. Pada lebar mulai 1024px shell memakai sidebar kiri persisten dengan brand; di bawahnya memakai bottom navigation. Aksesibilitas dan Bantuan menjadi utility sidebar, sementara Notifikasi, pengaturan cepat dan menu akun berada di header. Admin memiliki tujuh tujuan sendiri: Dashboard, Lowongan, Perusahaan, Lamaran, Pengguna, Moderasi, Analytics; BISINDO dan pengelolaan ruang Community tetap tersedia sebagai pendukung.

Beranda menampilkan salam, progres empat bagian profil dasar, jumlah CV, tiga lamaran terbaru dan maksimal tiga rekomendasi. Progres tidak menghitung persetujuan data sensitif sebagai kewajiban. Lowongan tetap memakai pencarian/filter/sort yang sudah ada. Feed rekomendasi lengkap tersedia terpisah. Flag feed hanya menyembunyikan rekomendasi; Beranda tidak lagi berubah menjadi pencarian.

### Hierarki Web final

```text
/                         landing publik / Beranda personal untuk seeker
/home                     Beranda personal (terlindungi)
  /rekomendasi            feed matching lengkap
/lowongan                 pencarian, filter, sort
  /:id                    detail pekerjaan
    /apply                menuju detail ?lamar=1, memakai dialog melamar lama
/lamaran                  daftar lamaran
  /:id                    detail lamaran
/cv                       daftar CV
  /new                    konfirmasi membuat CV dari profil
  /chat                   pembuat CV dengan AI yang sudah ada
  /:id                    editor CV lama, tetap berfungsi
    /edit                 alamat eksplisit ke editor yang sama
/profil                   profil karier dan data pribadi yang sudah ada
/pengaturan               shell pengaturan, indeks berisi panel akun
  /notifikasi             preferensi notifikasi
  /aksesibilitas          preferensi aksesibilitas
/notifikasi               pusat notifikasi
/help                     bantuan penggunaan dan tautan Community/BISINDO
/masuk, /masuk/google     alur autentikasi dan callback OAuth lama
/onboarding               wizard lama
/companies/:id            profil perusahaan publik
/community/*, /kamus/*    seluruh fitur Community dan BISINDO lama
/admin/*                  shell dan guard admin, halaman tetap lazy
  /                      Dashboard
  /jobs/*                Lowongan
  /companies/*           Perusahaan
  /lamaran/*             Lamaran
  /pengguna/*            Pengguna
  /community/laporan/*   Moderasi
  /analytics             Analytics (reuse metrik yang tersedia)
  /settings              preferensi aksesibilitas
  /account               panel akun
  /community/*, /kamus/* fitur pendukung admin tetap tersedia
```

Prefix tanpa komponen mengelompokkan halaman Lowongan, Lamaran dan CV tanpa merender daftar di belakang halaman detail. Alias `/jobs/*`, `/applications/*`, `/resumes/*`, `/profile/*`, `/accessibility/*`, `/notifications/*`, `/settings/*` menuju alamat Indonesia yang sudah digunakan. Sisa path dan query dipertahankan. Endpoint API, payload push, callback OAuth dan URL lama tidak diubah. Guard sesi/onboarding/peran tetap dipakai.

### Hierarki Mobile final

```text
RootNavigator (sesi dan onboarding menentukan cabang yang tersedia)
├── Auth → AuthStack
│   ├── Masuk
│   └── Verifikasi
├── OnboardingFlow → OnboardingStack
│   └── Onboarding
└── Utama → MainTabs (Back mengikuti riwayat tab)
    ├── Beranda → HomeStack
    │   ├── BerandaRingkasan
    │   ├── Rekomendasi
    │   ├── LowonganDetail (dialog melamar lama)
    │   └── Notifikasi
    ├── Cari [label Lowongan] → JobsStack
    │   ├── LowonganDaftar
    │   └── LowonganDetail (dialog melamar lama)
    ├── Lamaran → ApplicationsStack
    │   ├── LamaranDaftar
    │   └── LamaranDetail
    ├── Cv [label CV] → ResumeStack
    │   ├── CvDaftar (aksi membuat CV dari profil)
    │   ├── CvEditor
    │   └── CvBagian
    └── Profil → ProfileStack
        ├── ProfilUtama
        ├── ProfilDasar, ProfilSensitif
        ├── Karier, KarierForm
        ├── Aksesibilitas
        ├── Pengaturan
        └── Bantuan
```

Nama tab internal `Cari`/`Cv` dipertahankan untuk mengurangi migrasi kontrak. Detail dan editor kini berada dalam stack masing-masing; lima tab tetap tampil. Navigasi silang dan antrean deep link/push menunjuk `Utama → tab → screen`. `initial: false` memastikan tautan langsung ke detail tetap memiliki halaman daftar untuk Back. State stack CV bertahan saat beralih tab. Native belum memiliki pembuat CV AI; implementasi ini mempertahankan editor/pembuatan CV native yang tersedia, dan `/cv/chat` Web tetap tersedia.

### Perilaku aksesibilitas dan kriteria terkait

| Area | Perilaku yang diterapkan | WCAG yang terkait |
| --- | --- | --- |
| Keyboard | Tautan semantik; tombol akun memakai Enter/Space, state expanded dan Escape; panel cepat memakai Dialog shared dengan fokus kembali ke trigger | 2.1.1, 2.1.2, 4.1.2 |
| Melewati navigasi | Tautan awal “Langsung ke konten utama” menuju satu `<main tabindex="-1">` | 2.4.1, 1.3.1 |
| Konteks halaman | Heading utama, judul dokumen yang tersedia, breadcrumb hanya pada detail; perpindahan pathname memfokuskan h1/main setelah halaman siap | 2.4.2, 2.4.3, 2.4.6 |
| Fokus tetap terlihat | Ring fokus global dipertahankan; ruang bawah dan scroll margin mengikuti tinggi bottom navigation yang diukur, termasuk font besar | 2.4.7, 2.4.11 |
| State aktif | `aria-current="page"`, underline/bobot teks; tab native role `tab`, label tunggal dan state `selected`; ikon dekoratif disembunyikan | 1.4.1, 4.1.2 |
| Navigasi konsisten | Lima tujuan, urutan tetap di seluruh halaman; utility terpisah; admin memakai navigasi sendiri | 3.2.3, 3.2.4 |
| Kontras dan ukuran | Token proyek tetap digunakan; skala teks dan kontras tinggi berlaku; target internal 44px/dp dan 56 saat preferensi besar aktif | 1.4.3, 1.4.4, 1.4.10, 1.4.11, 2.5.8 |
| Form dan galat | Form login/onboarding/profil/melamar/CV shared dipertahankan; status/galat ringkasan dan simpan preferensi berupa teks; dialog melamar tetap memakai perilaku form lama | 3.3.1, 3.3.2, 4.1.3 |
| Gerak | Transisi native memakai token reduce-motion; CSS menghormati preferensi gabungan OS/store proyek; perubahan rute tidak memerlukan animasi | Requirement gerak produk; 2.3.3 merupakan kriteria AAA tambahan |

Query/filter tidak memindahkan fokus dari input. Browser POP mempertahankan fokus kartu pekerjaan yang dipulihkan fitur lama. Dialog yang sedang terbuka tidak diganggu fokus rute. Native heading tingkat utama mengirim accessibility focus saat screen aktif, sedangkan heading bagian tidak merebut fokus.

Panel cepat Web reuse `PanelAksesibilitas` dan store Web. Native reuse `LangkahPreferensi` dan store mobile; pembaruan ke akun diserialkan agar pilihan cepat tidak tersimpan terbalik. Ukuran teks, kontras tinggi, reduce-motion, teks sederhana, target besar dan preferensi BISINDO tetap memakai state yang sama dengan onboarding/pengaturan.

### Validasi otomatis

| Pemeriksaan | Hasil |
| --- | --- |
| ESLint Web (termasuk jsx-a11y) dan Mobile | Lulus, tanpa warning |
| Typecheck Web dan Mobile | Lulus |
| Vitest Web | 79 file, 913 tes terverifikasi setelah koreksi: full suite 911 lulus/2 gagal; dua file gagal diperbaiki dan pengulangan seluruh 21 tes pada keduanya lulus |
| Vitest Mobile | 16 file, 185 tes lulus |
| Jest/RNTL navigator native Android | 4 tes lulus: label/role/selected, target 44/56dp, stack detail dan Back, state CV antar-tab, fokus heading |
| Playwright seluruh suite, Chrome | 308 tes lulus; mencakup axe, keyboard, Back/Forward, responsive, preferensi, dan regresi bisnis |
| Navigasi baru di browser | 6 tes termasuk lebar 320/768/1024/1440, reflow teks 200%, target 44/56, active detail, breadcrumb, skip link, quick settings, akun dan alias query |
| Browser setelah koreksi katalog | 11 tes navigasi/rekomendasi lulus pada build akhir |
| Build Web + service worker | Lulus |
| Budget JS awal | 145,5 KiB gzip dari batas 200 KiB; 103 chunk lazy |
| Lighthouse desktop, 3 kali, landing `/` | Accessibility 100/100/100; performance 99/100/100; best practices 96; SEO 100; assertion proyek lulus |
| Lighthouse 3G, 3 kali, landing `/` | Accessibility 100/100/100; performance 75/75/76; assertion proyek lulus dengan ambang 75 yang sudah ada |

Pengujian Lighthouse mengukur landing publik, sesuai konfigurasi quality gate yang sudah ada. Halaman seeker/admin baru diperiksa melalui axe browser dan registry halaman, bukan diklaim mendapat skor Lighthouse per halaman. Ambang 3G tidak diubah; utang proyek untuk menaikkan performance ke 80 tetap ada.

Dua kegagalan unit Web adalah katalog `pelamar` yang belum dimuat oleh route rekomendasi dan ekspektasi keyboard admin yang masih mencari label lama “Ringkasan”. Katalog ditambahkan; test memakai label “Dashboard” sesuai requirement. Pengulangan `admin.test.tsx` dan `i18n-lazy.test.ts` lulus 21/21; pemeriksaan router/katalog tambahan lulus 19/19. Tidak ada assertion yang dihapus untuk melewati kegagalan. Full suite tidak diulang lagi setelah koreksi yang terbatas ini.

Infrastruktur native baru dapat dijalankan dengan `pnpm --filter @nawasena/mobile test:navigation` dan sudah menjadi bagian script `test` Mobile; runner ini reuse Jest/Expo/RNTL dari paket UI native workspace, tanpa menambah library aplikasi. Dalam sesi Windows ini executable Node lokal digunakan karena launcher pnpm mencoba mengambil versi paket manager dan gagal verifikasi/network. Lighthouse semula gagal menutup proses Chrome; pengulangan menggunakan Chrome yang dikelola Playwright dan port debug, dengan setting/ambang audit tetap sama. Tes browser semula terhenti ketika disk penuh; pengulangan mematikan trace agar tidak menumpuk artefak dan seluruh 308 tes lulus. Cache unit Web dipindahkan sementara ke workspace setelah cache OS hilang; tidak ada perubahan config runner produksi untuk workaround ini.

Log lokal: `tmp/navigation-web-unit-final2.log` (full), `tmp/navigation-web-corrections.log`, `tmp/navigation-web-catalog-final.log`, `tmp/navigation-mobile-unit-final.log`, `tmp/navigation-native-final.log`, `tmp/navigation-web-e2e-final.log`, `tmp/navigation-web-e2e-catalog.log`, `tmp/navigation-lighthouse-final.log`, `tmp/navigation-lighthouse-3g-final.log`. Laporan Lighthouse tersimpan pada `apps/web/.lighthouseci/` dan `apps/web/.lighthouseci-3g/`; screenshot hasil browser pada `tmp/nawasena-navigation-320.png` dan `tmp/nawasena-navigation-1440.png`. Artefak tersebut diabaikan Git.

### Validasi manual yang masih diperlukan

NVDA terpasang pada mesin, tetapi sesi ini tidak memiliki kontrol desktop dan pembacaan output speech untuk menjalankan smoke test manual. ADB tersedia dan pemeriksaan `adb devices -l` menunjukkan tidak ada perangkat/emulator terhubung. Konfigurasi aplikasi saat ini hanya mengaktifkan Android; VoiceOver perlu dijalankan saat target iOS diaktifkan. Tes navigator native memeriksa algoritma Back dan pemanggilan fokus, tetapi tidak membuktikan announcement, urutan eksplorasi atau tombol sistem pada perangkat.

| Pemeriksaan manual | Hasil yang harus dibuktikan |
| --- | --- |
| NVDA + Chrome/Firefox | Skip link pertama; landmark bernama; lima primary destination; nama/state aktif tunggal; h1 diumumkan setelah navigasi; akun dan dialog bekerja dengan keyboard dan Escape |
| TalkBack + Android | “Beranda, tab, dipilih”; ikon tidak dibaca ulang; heading mendapat fokus; tab tetap tampil pada detail; Back sistem dari detail ke daftar, lalu mengikuti riwayat tab |
| Font OS besar / pembesaran browser | Tidak ada kehilangan konten/aksi; fokus tidak tertutup bottom navigation; utility tetap terjangkau; periksa juga landscape |
| Alur bisnis dengan API nyata | Login/OAuth, onboarding, pencarian, apply, detail lamaran, simpan CV dan profil; E2E otomatis menggunakan API fixture |
| VoiceOver setelah target iOS aktif | Name/role/selected, heading focus, urutan navigasi dan perilaku Back pada perangkat iOS |

Lighthouse 100 dan axe tanpa pelanggaran bukan bukti bahwa seluruh WCAG 2.2 AA sudah terpenuhi. Status manual di atas belum dinyatakan lulus.

### Daftar file implementasi

File berikut merupakan perubahan tugas navigasi ini. Perubahan yang sudah ada pada `.env.example`, README/config Expo, log Phase 15, script provider dan konfigurasi cloudflared milik pengguna tidak termasuk perubahan tugas ini.

| Kelompok | File yang diubah/ditambahkan |
| --- | --- |
| Shell Web | `apps/web/src/app/navigasi-web.tsx`, `tata-letak.tsx`, `gaya.css`, `lencana-notifikasi.tsx`, `ikon-navigasi.tsx`, `aksesibilitas-cepat.tsx`, `keluar-akun.tsx`, `fokus-rute.tsx`, `breadcrumb.tsx` |
| Routing Web | `apps/web/src/app/routes.ts`; `apps/web/src/routes/beranda.tsx`, `beranda-seeker.tsx`, `bantuan.tsx`, `cv-baru.tsx`, `admin.tsx`, `admin-analytics.tsx` |
| Fitur/katalog Web | `apps/web/src/features/beranda/ringkasan.tsx`, `apps/web/src/features/job-feed/feed-matching.tsx`; `apps/web/src/shared/i18n/katalog/shell.ts`, `beranda.ts`, `admin.ts` |
| Unit Web | `apps/web/__tests__/admin.test.tsx`, `beranda-feed.test.tsx`, `katalog-kelengkapan.test.ts`, `navigasi-web.test.tsx`, `onboarding.test.tsx`, `registry-halaman.test.ts`, `router.test.tsx`, `tata-letak.test.tsx` |
| Browser Web | `apps/web/e2e/navigation.spec.ts`, `halaman.ts`, `beranda-feed.spec.ts`, `lompat-ke-konten.spec.ts` |
| Navigator Mobile | `apps/mobile/src/App.tsx`; `apps/mobile/src/navigation/TabUtama.tsx`, `StackUtama.tsx`, `types.ts`, `IkonTab.tsx`, `tujuan-stack.ts`, `deep-link.ts`, `PantauTautan.tsx` |
| UI/perilaku Mobile | `apps/mobile/src/komponen/Layar.tsx`, `apps/mobile/src/notifikasi/TombolNotifikasi.tsx`, `apps/mobile/src/onboarding/Langkah.tsx`, `apps/mobile/src/screens/BerandaScreen.tsx`, `apps/mobile/src/screens/profil/ProfilScreen.tsx`, `UtilityScreen.tsx` |
| Alur silang Mobile | `apps/mobile/src/lamaran/BagianLamar.tsx`, `DialogLamar.tsx`, `apps/mobile/src/screens/lamaran/LamaranDetailScreen.tsx` |
| Tes/config Mobile | `apps/mobile/__tests__/navigation-stack.test.ts`, `navigation.native.tsx`, `apps/mobile/jest.navigation.config.cjs`, `apps/mobile/.eslintrc.cjs`, `apps/mobile/package.json` |
| Dokumentasi | `docs/implementation/navigation-redesign.md`, `docs/implementation/log/implementation_log_phase19.md` |

Rujukan struktur: [React Router — prefix route tanpa elemen](https://reactrouter.com/start/declarative/routing), [React Navigation — navigator bersarang dan initial screen](https://reactnavigation.org/docs/nesting-navigators/).
