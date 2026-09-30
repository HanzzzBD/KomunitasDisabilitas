# Registry Utang Teknis

> **Dibuat:** 2026-09-05 (rekonsiliasi setelah PR-047)
> **Cakupan:** seluruh repo, seluruh phase.

## Kenapa berkas ini ada

Sampai hari ini utang teknis di repo ini hidup **hanya sebagai prosa** yang tersebar di
`docs/implementation/log/*.md` — kadang di bagian "Utang yang SENGAJA ditinggalkan",
kadang di "Risiko yang ditemukan", kadang hanya sebagai satu kalimat di tengah paragraf
"Next steps". Untuk menjawab "utang apa yang masih terbuka hari ini?" seseorang harus
membaca ulang lima log sepanjang belasan ribu baris, dan jawabannya akan berbeda-beda
tergantung siapa yang membaca.

Kegagalan itu sudah pernah menggigit dua kali, dan keduanya tercatat:

* **Audit AC Phase 06 (2026-09-05).** 25 checklist AC tidak pernah dicentang meski
  pekerjaannya ada. Yang hilang bukan pekerjaannya — melainkan catatannya.
* **Utang OpenAPI PR-037.** Log PR-037 menjadwalkan pembayarannya "di PR-040"; PR-040
  justru mewarisi dan menambahnya, lalu dua PR berikutnya ikut menambah. Pelajarannya
  ditulis sendiri di log itu: *"utang yang dijadwalkan ke PR berikutnya tanpa penagih
  otomatis akan ikut bergeser bersama PR itu."*

Registry ini adalah penagihnya. Ia **bukan** pengganti catatan di log — log tetap
tempat menuliskan sebab dan pertimbangan lengkap. Yang ada di sini adalah **status**,
**pemilik**, dan **pemicu**: tiga hal yang harus bisa dijawab tanpa membaca prosa.

## Aturan

* **Setiap utang punya pemicu, bukan hanya pemilik.** "Nanti di PR-066" adalah pemilik;
  "saat modul memanggil `createAiGateway` langsung" adalah pemicu. Utang yang hanya
  punya pemilik akan bergeser bersama pemiliknya.
* **Status hanya tiga:** `TERBUKA`, `LUNAS`, `DIBATALKAN` (beserta alasan pembatalan).
* **Utang yang alasannya sudah tidak benar wajib ditulis ulang**, bukan dibiarkan.
  Alasan basi lebih berbahaya daripada tidak ada alasan: ia menghentikan orang bertanya.
* **Utang LUNAS tidak dihapus dari berkas ini.** Riwayatnya adalah bukti bahwa
  penagihnya bekerja.

---

## Register

> Berisi utang **TERBUKA** dan yang **baru LUNAS**. Yang lunas tidak dihapus: riwayatnya
> adalah bukti bahwa penagihnya bekerja, dan tanggal "ditemukan → lunas" adalah satu-satunya
> ukuran yang kita punya atas seberapa cepat utang di repo ini benar-benar dibayar.

### U-01 — `pnpm format` menulis ulang 100+ berkas di luar scope

| | |
|---|---|
| **Status** | TERBUKA |
| **Jenis** | Tooling |
| **Ditemukan** | PR-047 (2026-09-05) |
| **Pemilik** | Belum ditetapkan |
| **Pemicu** | Siapa pun yang menjalankan `pnpm format` dan mengirim diff-nya |

Menjalankan `pnpm format` pada pohon yang **`pnpm lint` hijau** tetap menulis ulang
lebih dari 100 berkas di seluruh workspace (`apps/api`, `apps/web`, `packages/*`) —
termasuk berkas yang sama sekali tidak disentuh PR mana pun. Artinya prettier tidak
idempotent terhadap kode yang sudah ter-commit.

**Kenapa ini utang dan bukan sekadar gangguan.** Perintahnya ada di CLAUDE.md §10 sebagai
perintah rutin, tanpa peringatan. Cepat atau lambat seseorang menjalankannya, melihat
diff-nya besar, lalu mengirimkannya — dan review 100 berkas akan mengubur perubahan yang
sesungguhnya. Di PR-047 diff itu sempat masuk dan harus dikembalikan satu per satu.

**Yang BELUM diselidiki:** apakah sebabnya drift versi prettier, `.prettierignore` yang
kurang, atau konfigurasi yang berubah setelah berkas-berkas itu ditulis. Menebaknya di
sini akan menjadi alasan basi seperti yang dilarang aturan di atas.

**Bukan blocker.** `pnpm lint` (yang dijalankan CI) tetap hijau; yang rusak adalah
perintah `format` manual.

---

### U-02 — Bus event in-process bisa kehilangan notifikasi saat proses mati

| | |
|---|---|
| **Status** | **TERBUKA — dipersempit 2026-09-06** (gerbang PR-049a sudah dijalankan) |
| **Jenis** | Durability |
| **Ditemukan** | PR-047 (2026-09-05) |
| **Pemilik** | Belum ditetapkan — lihat "hasil gerbang" di bawah |
| **Pemicu** | Saat kabar in-app/push menjadi SATU-SATUNYA kabar bagi suatu peristiwa |

`core/events` adalah bus in-process tanpa persistensi, retry, maupun urutan (batas 2 yang
ditulis di kepala berkasnya). Event yang terbit saat proses mati memang hilang — dan
sejak PR-047, event yang hilang berarti **notifikasi yang tidak pernah ada**, tanpa satu
pun cara bagi pengguna mengetahui bahwa ia kehilangan sesuatu.

**Kenapa BELUM dipindahkan ke antrean sekarang** (keputusan owner 2026-09-05): hari ini
notifikasi bukan satu-satunya kabar. Status lamaran tetap benar di DB dan tetap terbaca
di layar lamaran, jadi kehilangan notifikasi berarti kehilangan *pemberitahuan*, bukan
kehilangan *informasi*. Memindahkannya ke BullMQ sekarang membeli ketahanan untuk risiko
yang belum matang, dengan biaya satu processor baru dan satu jalur yang harus dirawat.

**Gate PR-049 — apa yang wajib diputuskan di sana, bukan diasumsikan:**

1. Apakah email membuat notifikasi menjadi **satu-satunya** kabar untuk suatu peristiwa?
   (Contoh nyata yang sudah tercatat: *pemberitahuan pasca-hapus untuk akun Google-only* —
   lihat U-11. Pengguna itu **tidak punya layar** untuk melihat kabarnya.)
2. Bila ya untuk peristiwa mana pun, kabar itu **harus lahir dari job antrean yang DIPICU
   event ini**, bukan dari handler event-nya. Ini sudah ditulis sebagai syarat di komentar
   `core/events` dan di log PR-047.
3. Bila tidak, tuliskan alasannya di log PR-049 — supaya PR berikutnya tidak mengulang
   pertanyaan yang sama dari nol.

Gate ini juga ditempelkan di dokumen phase (PR-049 → "Gate masuk"), sebab registry yang
hanya dibaca saat seseorang ingat membacanya bukan penagih.

**HASIL GERBANG (PR-049a, 2026-09-06) — dijawab, bukan diasumsikan.** Penelusuran lengkapnya
di log PR-049a; ringkasnya:

1. **Ada satu**, dan ia bukan salah satu dari ketiga event notifikasi: **pemberitahuan
   pasca-hapus akun** (U-11). Yang mengejutkan dari penelusuran itu — kabar tersebut tidak
   pernah melewati bus event sama sekali. Ia panggilan `void sender.send().catch()` langsung
   di `account.service.ts`, yang untuk durabilitas justru **lebih lemah** daripada bus:
   mati bersama proses, tanpa retry, tanpa jejak.
2. **Sudah dipenuhi.** Kabar itu kini lahir dari job `notify-email` yang **di-await sebelum
   permintaan dijawab**. U-11 lunas bersamanya.
3. **Ketiga kabar notifikasi tetap boleh lewat bus**, dan alasannya masih benar: statusnya
   tetap benar di DB dan tetap terbaca di layar lamaran. PR-049a tidak mengirim satu pun
   email dari ketiga event itu — email sambutan/status baru lahir di PR-049b, dan **di sanalah
   pertanyaan ini harus ditanyakan ulang**, sebab email yang lahir dari handler event akan
   ikut hilang bersama prosesnya tanpa satu pun cara pengguna mengetahuinya.

**HASIL GERBANG KEDUA (PR-049b, 2026-09-06).** Dijalankan ulang, dan jawabannya **tidak ada**:
ketiga sumber email biasa sudah punya baris `notifications` yang bisa dibaca ulang di layar
dan push sejak PR-048b, sedangkan FAKTA yang dikabarkan tetap benar di DB.

Satu hal yang perlu dicatat supaya tidak ditanyakan lagi dari nol: email di PR-049b **tidak
menambah satu pun kelas kegagalan baru** pada U-02. Event yang hilang saat proses mati berarti
baris notifikasinya pun tidak pernah lahir — jadi tidak ada keadaan "ada di layar tetapi
emailnya hilang". Yang hilang tetap *pemberitahuan*, bukan *informasi*. Emailnya sendiri
tetap lahir dari job antrean (bukan dikirim di dalam handler), meski gerbang tidak menuntutnya:
pengiriman di dalam handler tidak punya retry, dan hiccup provider adalah kegagalan yang paling
sering terjadi di jalur ini.

**Pemicu berikutnya**, karena itu: setiap PR yang membuat notifikasi in-app menjadi
satu-satunya kabar bagi peristiwa baru — bukan penambahan kanal.

**Pelanggan non-notifikasi pertama (PR-069, embedding).** Handler-nya hanya meng-enqueue
`ai-embed`, jadi yang bisa hilang saat proses mati hanyalah jarak `emit`→`enqueue` — akibatnya
vektor basi sampai suntingan berikutnya, bukan informasi yang hilang. Pemulihannya alat
re-embed massal (U-29).

---

### U-03 — Ekspor PDP belum memuat `accessibility_profiles`

| | |
|---|---|
| **Status** | **LUNAS 2026-09-05** (keputusan owner: bayar sekarang) |
| **Jenis** | Kepatuhan (UU PDP §8.7, hak portabilitas) |
| **Ditemukan** | Rekonsiliasi 2026-09-05 |
| **Dibayar di** | PR `pdp-ekspor-preferensi-notifikasi` (2026-09-05), bersama U-04 |
| **Pemicu** | Sudah terpicu sejak Phase 04 merged |

`export-kelengkapan.test.ts` menempatkan `accessibility_profiles` di `DITUNDA` dengan
alasan *"modul accessibility (Phase 04)"*, dan komentar di atasnya menjelaskan seluruh
daftar itu dengan kalimat: *"Tabelnya sudah ada sejak migrasi 02–03, tetapi TIDAK ADA
endpoint yang bisa mengisinya."*

**Kalimat itu sudah tidak benar untuk baris ini.** Modul accessibility lahir di Phase 04
(merged), `/me/accessibility` melayani baca dan tulis, dan sejak PR-034 setiap akun baru
**otomatis** mendapat baris preferensi lewat pelanggan `auth.user_registered`. Jadi datanya
bukan "belum bisa dimiliki" — ia dimiliki oleh **setiap** pengguna yang pernah mendaftar.

**Akibatnya nyata:** pengguna yang memakai haknya mengunduh data pribadi hari ini menerima
berkas berisi `account` + `profile` saja. Preferensi aksesibilitasnya — data yang ia pilih
sendiri, tentang disabilitasnya — tidak ikut. Ini persis kegagalan yang diperingatkan
kepala berkas penjaga itu: *"endpoint tetap 200, test tetap hijau, dan pengguna menerima
berkas yang kurang tanpa satu pun cara mengetahuinya."*

Penjaganya tidak gagal — ia memang hanya menuntut setiap tabel **berada di salah satu dari
tiga keadaan**, dan `DITUNDA` adalah keadaan yang sah. Yang gagal adalah tidak adanya yang
meninjau ulang alasan `DITUNDA` saat blocker-nya lunas.

**PEMBAYARANNYA (2026-09-05).** `createAccessibilityExportContributor` membaca lewat service
yang SAMA dengan yang melayani `/me/accessibility` — bukan instance kedua, supaya berkas
ekspor tidak bisa menyimpang dari apa yang dilihat pemiliknya di pengaturannya. Barisnya
berpindah `DITUNDA` → `TERDAFTAR`. Pengguna yang belum pernah memilih tetap mendapat tujuh
`null`, bukan bawaan: "belum memilih" dan "memilih bawaan" adalah dua hal berbeda, dan berkas
ekspor tidak boleh mengklaim pilihan yang tidak pernah dibuat orangnya. Diverifikasi
end-to-end terhadap API dev, bukan hanya lewat fake.

---

### U-04 — Ekspor PDP belum memuat `notifications`

| | |
|---|---|
| **Status** | **LUNAS 2026-09-05** (keputusan owner: bayar sekarang) |
| **Jenis** | Kepatuhan (UU PDP §8.7) |
| **Ditemukan** | Rekonsiliasi 2026-09-05 |
| **Dibayar di** | PR `pdp-ekspor-preferensi-notifikasi` (2026-09-05), bersama U-03 |
| **Pemicu** | **Terpicu oleh PR-047 itu sendiri** |

Alasan `DITUNDA`-nya berbunyi *"modul notifications (Phase 07)"*. Modul itu lahir di
PR-047, dan sejak saat itu baris `notifications` benar-benar ada untuk pengguna sungguhan
(sambutan akun baru lahir dari `auth.user_registered`).

Utang ini **dilahirkan oleh PR-047 dan tidak dibayar di sana** — dicatat apa adanya, bukan
disembunyikan.

**PEMBAYARANNYA (2026-09-05).** `createNotificationsExportContributor` di atas
`semuaUntukEkspor()` — pembacaan tak berbatas yang sengaja DIPISAH dari `list()` dan tidak
punya endpoint, supaya yang tak berbatas tidak bisa dipanggil tanpa sengaja dari jalur HTTP
biasa. Kalimatnya **dirender**, bukan disalin, memakai renderer yang sama dengan yang
melayani layar; akibatnya notifikasi lama ikut membawa kalimat versi terbaru — dan itu benar,
sebab yang disimpan sistem ini memang `type` + referensi. Barisnya berpindah `DITUNDA` →
`TERDAFTAR`. Diverifikasi end-to-end terhadap API dev. Konsekuensi ukurannya dicatat sebagai
**U-16**.

---

### U-05 — Atribusi `ai_usage` di penjaga ekspor menunjuk phase yang salah

| | |
|---|---|
| **Status** | **LUNAS — PR-066 (2026-09-28)** (atribusi dikoreksi 2026-09-05) |
| **Jenis** | Kepatuhan (UU PDP §8.7) |
| **Pemilik** | **PR-066** (bukan Phase 06) |
| **Pemicu** | Saat endpoint fitur AI pertama menulis baris `ai_usage` |

Alasan `DITUNDA`-nya berbunyi *"modul AI (Phase 06)"*, dan Phase 06 sudah merged — jadi
sekilas ia tampak seperti U-03/U-04. **Ia berbeda, dan perbedaannya penting:** substansi
alasannya masih berlaku. Tidak ada satu pun endpoint yang menulis `ai_usage` hari ini
(`boot.ts` belum merakit `aiClient` — lihat U-06), jadi tabelnya benar-benar masih kosong
untuk setiap pengguna.

Yang salah hanyalah **pemiliknya**: bukan Phase 06 yang melahirkan datanya, melainkan
PR-066 — endpoint AI pertama. Dibiarkan menunjuk Phase 06, baris ini akan terlihat seperti
utang yang sudah jatuh tempo padahal belum, dan setiap rekonsiliasi berikutnya akan
membuang waktu memeriksanya ulang.

**PEMBAYARANNYA (2026-09-28, PR-066).** Pemicunya menyala di PR yang sama —
`POST /ai/cv-chat` menulis baris `ai_usage` pertama — dan dibayar di sana (keputusan owner).
Bagian ekspor `aiUsage` (`exportAiUsageSchema`: fitur, provider, token, versi prompt, waktu —
tanpa isi, sebab isi memang tidak pernah disimpan) lewat `createAiUsageExportContributor`;
`ai_usage` pindah `DITUNDA` → `TERDAFTAR` di `export-kelengkapan.test.ts`.

---

### U-15 — `prisma migrate dev` mengarang `DROP INDEX` atas indeks raw-SQL

| | |
|---|---|
| **Status** | TERBUKA — **penjaganya sudah terpasang** |
| **Jenis** | Tooling / risiko produksi |
| **Ditemukan** | PR-048a (2026-09-05) — **sudah menggigit sekali** |
| **Pemilik** | Belum ditetapkan |
| **Pemicu** | Setiap `prisma migrate dev` berikutnya |

Sebagian indeks repo ini dibuat lewat **raw SQL** di migrasi 03, karena Prisma tidak bisa
menyatakannya: HNSW pgvector, GIN, trigram, dan beberapa indeks komposit. Karena tidak
terwakili di `schema.prisma`, `prisma migrate dev` membacanya sebagai **drift** dan dengan
patuh menuliskan `DROP INDEX` untuk "merapikannya" — di tengah migrasi yang sebenarnya
hanya menambah satu tabel.

**Ini bukan risiko teoretis.** Saat menyiapkan PR-048a, migrasi yang seharusnya hanya
membuat tabel `devices` menghasilkan **tujuh** `DROP INDEX` dan sudah menjatuhkannya di DB
dev sebelum ketahuan:

```
applications_job_status, applications_user_updated, jobs_accommodations_gin,
jobs_embedding_hnsw, jobs_status_published_at, jobs_title_trgm,
seeker_profiles_embedding_hnsw
```

Bila lolos ke produksi, pencarian lowongan dan job matching berubah menjadi seq scan —
**tanpa satu pun error, tanpa satu pun test merah.** Hanya lambat, dan hanya setelah data
cukup banyak untuk membuatnya terasa. DB dev dipulihkan lewat `migrate reset`, dan migrasi
14 ditulis tangan berisi pernyataan aditif saja.

**Yang sudah dikerjakan (PR-048a):** penjaga di `migrasi-skema.test.ts` — setiap
`DROP INDEX` di migrasi mana pun harus terdaftar di `DROP_INDEX_DISENGAJA` beserta
alasannya, plus pemeriksaan arah sebaliknya (sembilan indeks raw-SQL wajib tetap ada di SQL
migrasi, agar yang hilang karena migrasinya *diedit* juga tertangkap).

**Yang BELUM dikerjakan — inilah utangnya:** sebabnya masih ada. Perbaikan sesungguhnya
adalah mendeklarasikan indeks yang **representable** di `schema.prisma` (indeks komposit
biasa seperti `applications_user_updated` bisa; HNSW/GIN/trigram tidak akan pernah bisa dan
selamanya butuh penjaga). Itu migrasi tersendiri, dan tidak boleh diselundupkan ke PR fitur.

**Sementara itu:** setiap migrasi baru wajib dibaca baris per baris sebelum di-commit.
`DROP INDEX` yang tidak Anda tulis sendiri adalah tanda perangkap ini, bukan pembersihan.

---

### U-16 — Berkas ekspor PDP tumbuh tanpa batas bersama riwayat notifikasi

| | |
|---|---|
| **Status** | TERBUKA |
| **Jenis** | Operasional (bukan kepatuhan) |
| **Ditemukan** | 2026-09-05 — lahir dari pembayaran U-04 |
| **Pemilik** | Belum ditetapkan |
| **Pemicu** | Pengguna pertama dengan riwayat notifikasi besar, atau lahirnya retensi notifikasi |

`GET /me/export` merakit seluruh berkas di memori lalu mengirimkannya sebagai satu response
JSON. Bagian `notifications` **tidak berpaginasi**, dan itu keputusan sadar: ekspor PDP yang
memotong riwayat bukan ekspor yang lengkap.

Konsekuensinya berkas tumbuh bersama riwayat pengguna — dan tidak ada yang mengurangi baris
`notifications` selain penghapusan akun (tidak ada retensi; dicatat di log PR-047).

**Kenapa belum ditangani.** Pada skala MVP (<5.000 pengguna) riwayat seseorang realistis
berjumlah puluhan, dan kuota ekspor sudah membatasi 3× per 24 jam per pengguna
(`EXPORT_POLICY`), jadi ini bukan permukaan yang bisa dipakai membebani server berulang kali.
Menyelesaikannya sekarang berarti memilih antara memotong riwayat (melanggar kelengkapan)
atau ekspor asinkron ber-berkas (infrastruktur yang belum ada).

**Yang akan memicunya:** retensi notifikasi bila kelak lahir, atau pengguna pertama yang
riwayatnya membuat response ini terasa. Keduanya menuntut keputusan yang sama — ekspor
asinkron, atau retensi yang membuat "seluruh riwayat" tetap berukuran wajar.

---

### U-06 — Empat utang perakitan `boot.ts` (jalur AI)

| | |
|---|---|
| **Status** | **LUNAS — PR-066 (2026-09-28) + PR-072 (2026-09-30)** |
| **Pemilik** | PR-072 (pemanggil `withDegradation` pertama) |
| **Pemicu** | Endpoint fitur AI pertama |
| **Sumber** | Log Phase 06 (PR-043b, PR-044b, PR-045, PR-046) |

`boot.ts` belum merakit `aiClient`, `createAiPromptCache`, jalur SSE, maupun pemanggil
`withDegradation`. Diverifikasi ulang 2026-09-05: masih benar — `boot.ts` hanya merakit
`createAiQuota` + `createAiModule({ quota })`. Seluruh jaminan Phase 06 karena itu hari ini
hanya sekuat test-nya; belum ada satu pun yang berjalan di produksi.

**PEMBAYARAN PR-066.** `boot.ts` kini merakit `createAiClient` dengan `createAiGateway`,
`createAiStreamGateway` (baru), recorder `ai_usage`, dan `createAiPromptCache` di atas
`redis.cache`; jalur SSE hidup lewat `POST /ai/cv-chat`. **Yang belum:** `withDegradation`
masih tanpa pemanggil — chat menurunkan kegagalan lewat event SSE ber-`degraded`, bukan lewat
pembungkus itu (aliran tidak punya "nilai pengganti" untuk dikembalikan).

**PR-067 juga tidak memakainya, dengan sengaja.** Finalize asinkron: kegagalan ekstraksi tidak
"diganti nilai" di tempat, melainkan menjadi KEADAAN (`extractionFailedAt` + notifikasi gagal)
yang dibaca klien. Sisi API-nya melempar `DegradedError` (kuota, fitur mati) yang sampai ke
klien sebagai 429/503 — penurunannya terjadi di klien. Pemakai alami `withDegradation` karena
itu kemungkinan besar bukan di jalur CV sama sekali; PR-068 yang memutuskan, dan bila ternyata
tidak ada pemakai sah, pertimbangkan mencabut ekspornya (aturan PR-041: seam tanpa pemakai
dicabut, bukan dibiarkan).

**PR-068 memutuskan: bukan di jalur CV.** Klien menurunkan kegagalan dari penanda `degraded`
(event SSE / kode 429–503), bukan dari `withDegradation` — helper itu milik server dan butuh
"nilai pengganti" yang bisa dikembalikan di tempat. Fitur pertama yang punya nilai seperti itu
adalah re-rank feed (PR-072: daftar tanpa peringkat). Bila PR-072 juga tidak memakainya, cabut
ekspornya di sana.

**PEMBAYARAN PR-072.** `feed-cache.service.ts` memesan jatah `rerank` lewat
`withDegradation(() => quota.periksaDanPakai(...), null)`: penolakan kuota (`DegradedError`
`KUOTA_AI_HABIS`) turun menjadi "feed tanpa re-rank" — urutan skor deterministik + penjelasan
template (PR-073) — sedangkan kegagalan lain (Redis tanpa fail-open, bug) tetap naik apa adanya.
Keempat bagian utang ini kini punya pemanggil produksi; ekspornya dipertahankan.

---

### U-07 — Seam F1: tidak ada penjaga struktural atas `createAiGateway`

| | |
|---|---|
| **Status** | **LUNAS — PR-066 (2026-09-28)** |
| **Pemilik** | PR-066 (syarat masuk) |
| **Pemicu** | Modul mana pun yang memanggil `createAiGateway` langsung |
| **Sumber** | Log Phase 06 (PR-043b F1) |

Tidak ada aturan lint maupun test yang mencegah sebuah modul memanggil `createAiGateway`
langsung dari barrel `core/ai`, melewati `AiClient` — yang berarti melewati kuota **dan**
jejak biaya **dan** cache. Diverifikasi 2026-09-05: masih tidak ada penjaganya;
`createAiGateway` tetap diekspor dari barrel.

Perlu dicatat bahwa penjaga sejenis **sudah terbukti bisa dibuat** di repo ini —
`boundaries.test.ts` sudah melarang impor tiga SDK AI (AC-5 PR-041). Yang kurang bukan
mekanismenya, melainkan aturannya.

**PEMBAYARANNYA (PR-066).** `__tests__/ai-gateway-jangkauan.test.ts` menolak PEMANGGILAN
delapan pabrik provider (`createAiGateway`, `createAiStreamGateway`, router, adapter
Gemini/Groq baik chat maupun stream) di mana pun selain `src/core/ai/**` dan `src/boot.ts`,
termasuk `apps/worker`. Diverifikasi mutasi: menambah satu panggilan `createAiGateway` di
`modules/ai` membuat build merah. Ekspornya dari barrel tetap ada — composition root butuh.

---

### U-08 — `prompt-registry.test.ts` masih non-rekursif *(laten)*

| | |
|---|---|
| **Status** | TERBUKA — **laten** |
| **Pemilik** | PR-044a |
| **Pemicu** | Subdirektori pertama di `core/ai/prompts/` |

Pemindainya berhenti di level atas (`readdirSync` tanpa rekursi), jadi template di
subdirektori tidak terlihat oleh penjaga "setiap `<nama>.vN.ts` terdaftar".

Diverifikasi 2026-09-05: `core/ai/prompts/` **belum punya subdirektori sama sekali**, jadi
utang ini tidak bisa menggigit hari ini. Ia dicatat sebagai laten dan bukan dihapus,
karena bentuk kegagalannya adalah yang paling buruk: penjaga yang berhenti menjaring tetap
hijau, dan tidak ada yang akan curiga.

---

### U-09 — Nama `OtpSender`/`OtpMessage` sudah tidak akurat

| | |
|---|---|
| **Status** | TERBUKA |
| **Jenis** | Kosmetik / keterbacaan |
| **Pemilik** | Belum ditetapkan |
| **Sumber** | Log Phase 02 (PR-018) |

Kanalnya generik (WhatsApp/SMS untuk pesan apa pun), bukan khusus OTP. Rename yang akurat
menyentuh 78 rujukan di 9 berkas. Diverifikasi 2026-09-05: nama masih dipakai.

**Kandidat kuat untuk dibayar di PR-049**, yang memang akan menyentuh kanal pengiriman —
di sana rename-nya berada di jalur perubahan, bukan menjadi diff terpisah yang mengubur
perubahan sesungguhnya.

---

### U-10 — Jendela toleransi rotasi token di sisi server

| | |
|---|---|
| **Status** | TERBUKA |
| **Pemilik** | Belum ditetapkan |
| **Sumber** | Log Phase 03 (PR-033i) |

Untuk dua celah balapan yang sengaja ditunda: dua tab bersamaan, dan pemulihan boot vs
refresh 401 di `/masuk/google`. Diverifikasi 2026-09-05: belum ada mekanisme toleransi di
`session.service.ts`.

---

### U-11 — Pemberitahuan pasca-hapus untuk akun Google-only

| | |
|---|---|
| **Status** | **LUNAS 2026-09-06** (PR-049a) |
| **Pemilik** | — |
| **Sumber** | Log Phase 03 |

Pengguna yang masuk lewat Google dan menghapus akunnya tidak menerima konfirmasi apa pun.
**Terkait langsung dengan U-02:** ini contoh nyata peristiwa yang kabarnya hanya lewat satu
kanal — pengguna itu sudah tidak punya akun, jadi tidak punya layar untuk melihatnya.
Kehilangan email di sini bukan kehilangan pemberitahuan, melainkan satu-satunya bukti bahwa
permintaan hapusnya diproses. Harus dinilai di gate U-02.

**PEMBAYARANNYA (PR-049a, 2026-09-06).** Akun tanpa nomor HP kini dikabari lewat email, dan
kabarnya lahir dari job antrean `notify-email` — bukan dari panggilan langsung seperti jalur
SMS-nya. Jangkauannya persis: pengguna Google-only selalu tercakup, sebab Google mengirim
`email_verified`. Alamat yang diketik sendiri lewat `PUT /me` **sengaja tidak** dikirimi apa
pun — mengabarkan keadaan akun seseorang ke alamat yang belum terbukti miliknya adalah bahan
phishing, bukan jaring pengaman. Tanpa tautan, dengan alasan yang sama seperti pesan SMS-nya.

---

### U-12 · U-13 · U-14 · U-19 · U-20 · U-21 — Utang verifikasi manual

| ID | Utang | Sumber | Kenapa belum |
|---|---|---|---|
| U-12 | **NVDA sampling** untuk lima komponen (Dialog, Toast, Kerangka, Tab, Kartu) + tiga halaman auth | Log Phase 03 (PR-027/028/030/032a/033) | Menuntut manusia + alat; seluruh klaim "diumumkan" bersandar pada struktur ARIA, bukan pendengaran alat sungguhan |
| U-13 | **Review copy oleh non-engineer** | Log Phase 03 (PR-029) | Paket teks sudah disiapkan, belum ada yang mereview |
| U-14 | **AC PR-030 #1** — login OTP end-to-end | Log Phase 03 | Menunggu kredensial provider OTP |
| U-19 | **Push nyata ke perangkat uji** (FCM) | Log PR-048b (2026-09-05) | Menunggu kredensial FCM + perangkat uji. Yang hanya bisa dijawab FCM sungguhan: apakah bentuk payload `notification` + `data` benar-benar memunculkan notifikasi saat aplikasi tertutup, dan apakah kode galatnya persis seperti yang diklasifikasikan |
| U-20 | **Email nyata di staging** (Resend) | Log PR-049a/b (2026-09-06) | Menunggu kredensial Resend + domain ber-SPF/DKIM. Yang hanya bisa dijawab pengiriman nyata: tampilan HTML di Gmail/Outlook (keduanya menulis ulang CSS) dan lolos tidaknya penyaring spam |
| U-21 | **Notification center multi-tab** | Log PR-050 (2026-09-06) | Yang hanya bisa dijawab dua tab sungguhan: apakah lencana di tab kedua ikut turun sesudah tab pertama menandai. Jawaban yang DIHARAPKAN: tidak, sampai tab kedua kembali fokus — cache TanStack tidak dibagi antar-tab. Perlu dipastikan itu memang yang terjadi, bukan sesuatu yang lebih buruk |

Kelimanya **tidak bisa diverifikasi dari disk** dan karena itu tidak pernah ikut rekonsiliasi
otomatis. Statusnya diambil apa adanya dari log terakhir yang menyebutnya.

**U-19 dan U-20 ditambahkan 2026-09-06 atas keputusan owner:** keduanya sebelumnya hanya hidup
sebagai prosa di dokumen phase dan log PR-nya — persis bentuk penyimpanan yang membuat berkas
ini harus dibuat. Keduanya **bukan blocker pengembangan**; keduanya **adalah** syarat sebelum
kanalnya dinyalakan bagi pengguna sungguhan.

---

### U-17 — Jendela commit→enqueue pada kabar pasca-hapus

| | |
|---|---|
| **Status** | TERBUKA |
| **Jenis** | Durability |
| **Ditemukan** | PR-049a (2026-09-06), sebagai batas yang disisakan gerbang U-02 |
| **Pemilik** | Belum ditetapkan |
| **Pemicu** | Saat ada peristiwa KEDUA yang kabarnya wajib durabel — dua penulis job "penting" tanpa outbox berarti dua tempat jendela yang sama terbuka |

`account.service.ts` mengantrekan job `notify-email` **sesudah** transaksi hapus commit,
bukan di dalamnya. Proses yang mati persis di antara keduanya — atau Redis yang tidak
terjangkau tepat saat itu — tetap kehilangan kabarnya.

**Kenapa ini tetap kemajuan besar, bukan masalah yang sama dengan nama baru.** Sebelumnya
jendelanya adalah SELURUH umur pengiriman: satu panggilan provider fire-and-forget yang bisa
memakan sepuluh detik, tanpa retry, dan mati bersama proses. Sekarang jendelanya milidetik
penulisan ke Redis, dan kegagalannya berisik (`error`, menyebut akibatnya secara harfiah).

**Yang menutupnya sepenuhnya:** *transactional outbox* — niat kirim ditulis ke tabel dalam
transaksi yang SAMA dengan penghapusan, lalu satu pekerja memancarkannya ke antrean. Biayanya
satu tabel, satu job pemancar, dan satu jalur baru yang harus dirawat. Tidak diambil di
PR-049a: untuk satu peristiwa, biaya perawatannya lebih besar daripada jendela yang ditutup.
Pemicunya ditulis di atas justru supaya perhitungan itu ditinjau ulang saat peristiwa kedua
lahir — bukan saat sudah ada lima.

---

### U-18 — Kabar pasca-hapus lewat SMS masih *fire-and-forget*

| | |
|---|---|
| **Status** | TERBUKA |
| **Jenis** | Durability |
| **Ditemukan** | PR-049a (2026-09-06) |
| **Pemilik** | Belum ditetapkan |
| **Pemicu** | Saat antrean pengiriman yang tidak bernama-email lahir (mis. `notify-sms`), atau saat U-17 dibayar dengan outbox — outbox membuat kanal tujuan menjadi detail, bukan penghalang |

PR-049a membuat jalur **email** durabel dan tidak menyentuh jalur **SMS** PR-021 — padahal
bagi pengguna bernomor, SMS itu juga satu-satunya kanal sesudah penghapusan: ia sama-sama
tidak punya sesi maupun layar. Jadi asimetrinya nyata, dan ditulis di sini apa adanya alih-
alih dibiarkan terlihat seperti kelalaian.

**Kenapa tidak ditarik ke PR-049a.** Antrean yang tersedia bernama `notify-email` (SDD §16).
Menaruh job SMS di atasnya adalah kebohongan nama yang akan hidup jauh lebih lama daripada PR
ini — dan nama queue adalah key Redis, jadi memperbaikinya belakangan berarti migrasi antrean.
Pilihan yang benar adalah queue tersendiri atau outbox, dan keduanya keputusan yang tidak
pantas diambil sambil lalu di PR yang sedang membawa keputusan keamanan.

**Beda tingkat risikonya, dan ini yang membuat urutannya benar:** pengguna bernomor
membuktikan diri dengan **kode OTP baru** saat menghapus akun; pengguna Google-only dengan
consent Google yang `auth_time`-nya tidak pernah dikirim (0 dari 16 token terukur, verifikasi
PR-033c-2). Jalur dengan bukti terlemah didahulukan.

---

### U-22 — Ukuran dokumen CV dibatasi per-larik, bukan per-dokumen

| | |
|---|---|
| **Status** | LUNAS — PR-063 (2026-09-25) |
| **Jenis** | Batas sumber daya |
| **Ditemukan** | PR-060 (2026-09-16) |
| **Pemilik** | **PR-063** (render PDF) |
| **Pemicu** | Saat processor Puppeteer pertama membaca `resumes.content` ke memori |

`resumeContentSchema` membatasi **jumlah elemen** tiap larik (30 riwayat kerja, 20
pendidikan, 60 keahlian, 30 sertifikasi, 20 organisasi) dan **panjang teks** tiap field.
Hasil kalinya membuat batas atas ukuran dokumen terhingga — kira-kira beberapa ratus
kilobyte pada isian ekstrem — tetapi **tidak ada satu pun pemeriksaan atas byte total**
dokumen `jsonb`-nya.

Kenapa belum dibayar di PR-060: angka yang benar untuk batas itu hanya bisa ditentukan oleh
pihak yang tahu berapa RAM yang dipakai satu render — dan itu PR-063, yang berjalan dengan
`concurrency 1` dan batas RAM kontainer (risiko T4, SDD §16). Menebak angkanya sekarang
berarti menaruh batas yang tidak punya dasar, lalu mewarisi kewajiban membelanya.

Kenapa tidak berbahaya hari ini: tidak ada satu pun pembaca `content` selain endpoint
pemiliknya sendiri. Yang pertama membacanya dalam proses yang bisa kehabisan memori adalah
processor PDF — yang belum ada.

**Penyelesaian PR-063.** Service render menghitung ukuran UTF-8 snapshot `title + content` dan
menolak nilai di atas `PDF_RENDER_MAX_INPUT_BYTES` (bawaan 1 MiB) sebelum membentuk HTML/DOM.
Batas normal skema berada jauh di bawahnya; guard ini menutup data lama/rusak atau penulisan langsung
ke database. Amplifikasi tersisa dibatasi lagi oleh concurrency queue 1 dan limit container worker
768 MiB. Keluaran PDF memiliki batas terpisah 20 MiB sebelum upload.

---

### U-23 — Presigned URL stack compose menunjuk host `minio:9000`

| | |
|---|---|
| **Status** | LUNAS — PR-064b (2026-09-27) |
| **Jenis** | Pengalaman pengembang |
| **Ditemukan** | PR-064a (2026-09-27) |
| **Pemilik** | **PR-064b** |
| **Pemicu** | Saat unduh PDF diuji end-to-end dari browser terhadap stack `docker compose` penuh, atau saat core/storage butuh endpoint publik yang berbeda dari endpoint internal (mis. CDN R2) |

Di `docker-compose.dev.yml`, API dan worker memakai `STORAGE_ENDPOINT=http://minio:9000`.
`presignDownload` menandatangani URL untuk host itu, yang hanya dapat di-resolve di dalam
jaringan compose — browser di host mendapat URL yang tidak bisa dibuka. Tidak mengenai alur
`pnpm dev` (endpoint `127.0.0.1:9000`) dan tidak mengenai produksi (endpoint R2 publik).
Perbaikan yang wajar: variabel opsional `STORAGE_PUBLIC_ENDPOINT` khusus untuk presign.

**Penyelesaian PR-064b.** `STORAGE_PUBLIC_ENDPOINT` opsional ditambahkan. Bila diisi, driver S3
memakai client kedua yang hanya untuk presign — URL **ditandatangani** untuk host publik (host
adalah bagian dari SigV4, jadi mengganti host setelah sign akan membatalkan tanda tangan);
upload tetap lewat `STORAGE_ENDPOINT`. Presign berjalan offline, client kedua tidak pernah
membuka koneksi. Kosong = perilaku lama (R2/produksi tidak berubah). Ditolak bila
`STORAGE_ENDPOINT` kosong, dan wajib HTTPS pada production. Compose dev mengisi API dengan
`http://127.0.0.1:9000`.

---

### U-24 — Tiga AC Phase 09 menunggu verifikasi manual/lingkungan nyata

| | |
|---|---|
| **Status** | TERBUKA — sebagian dibayar PR-068c (2026-09-29) |
| **Jenis** | Verifikasi manual |
| **Ditemukan** | Audit AC penutupan Phase 09 (2026-09-28) |
| **Pemilik** | Belum ditetapkan (butuh perangkat Windows + NVDA + Adobe Reader) |
| **Pemicu** | Sebelum rilis v1.0.0 (Phase 18), atau saat ada perangkat NVDA — mana yang lebih dulu |

Phase 09 ditutup ke `main` atas override owner dengan tiga AC terbuka (rincian di blok override
[Exit Criteria Phase 09](implementation/phase-09-resume-builder-pdf.md#exit-criteria)):

1. **PR-061** — isi [checklist NVDA editor CV](implementation/log/pr-061-nvda-checklist.md).
2. **PR-063** — isi kotak manual [checklist urutan baca PDF](implementation/log/pr-063-pdf-reading-order-checklist.md)
   (Adobe Reader + NVDA atas PDF hasil worker nyata).
3. **PR-064** — tempuh sekali jalur utuh: stack compose penuh, minta PDF dari UI, tunggu notifikasi
   `resume.pdf_siap`, unduh, buka berkasnya. Sejak PR-064a/b jalur ini dapat ditempuh di lokal
   (bucket otomatis, URL presigned dapat dibuka browser).

Sama sifatnya dengan U-12 dkk.: bukan kode yang kurang, melainkan bukti yang hanya bisa diambil
manusia dengan perangkat nyata.

**Dibayar sebagian — PR-068c (2026-09-29).** NVDA nyata dijalankan otomatis
(`apps/web/verifikasi/`); rinciannya ada di tiap checklist.
Butir 3 (**PR-064**) **LUNAS**: jalur utuh sudah ditempuh lewat UI di stack lokal.
**Masih terbuka:**
* **PR-063:** navigasi heading di pembaca PDF yang memakai tag (Adobe). Penampil Chrome tidak
  mengekspos heading PDF. Pohon struktur sudah terbukti benar. Juga belum diuji: zoom, kontras
  tinggi, dan pindah halaman.
* **PR-061:** label, status wajib, dan tombol nonaktif di dalam bagian, serta daftar CV. Langkah
  ini butuh desktop yang tidak sedang dipakai orang lain.

---

### U-25 — CV (`resumes`) masih `DITUNDA` di ekspor PDP padahal datanya sudah ada

| | |
|---|---|
| **Status** | **LUNAS — 2026-10-01** (keputusan owner: bayar sekarang) |
| **Jenis** | Kepatuhan (UU PDP §8.7) |
| **Ditemukan** | PR-065 (2026-09-28), saat mendaftarkan `ai_chat_sessions` ke penjaga yang sama |
| **Pemilik** | PR utang U-25 (`utang-u25-ekspor-cv`) |
| **Pemicu** | **Sudah menyala** sejak PR-060 merged: pengguna bisa membuat CV lewat `/me/resumes` |

`export-kelengkapan.test.ts` masih menaruh `resumes` di `DITUNDA` dengan alasan *"belum ada
endpoint yang bisa membuat CV"*. Alasan itu berhenti benar sejak PR-060 (Phase 09 sudah di
`main`): CV adalah data pengguna sungguhan yang hari ini **tidak ikut** berkas `GET /me/export`,
tanpa satu pun penjaga menyalak — pola yang persis sama dengan U-03/U-04.

**Kenapa tidak dibayar di PR-065.** Membayarnya menyentuh kontrak `dataExportSchema`, modul
`resumes`, dan fixture ekspor — di luar scope sesi chat, dan PR-065 sudah menambah satu bagian
ekspor sendiri. Cukup kecil untuk PR tersendiri: `createResumesExportContributor` di atas
`resumes.service` (bentuk `Resume` yang sama dengan `GET /me/resumes/:id`), pindahkan barisnya
`DITUNDA` → `TERDAFTAR`.


**PEMBAYARANNYA (2026-10-01).** `createResumesExportContributor` (modul `resumes`) membaca lewat
service yang SAMA dengan editor CV (`list` + `get`) dan menyumbang bagian `resumes` — larik
`resumeSchema` lengkap dengan isi — ke `dataExportSchema` (aditif; `EXPORT_FORMAT_VERSION` tetap 1).
Dirakit di `boot.ts` sesudah `aiUsage`. `export-kelengkapan.test.ts`: `resumes` pindah
`DITUNDA` → `TERDAFTAR`; yang tersisa di `DITUNDA` hanya `applications` (Phase 12). Berkas PDF
tidak ikut (artefak turunan dari isi yang sama).
---

### U-26 — Latensi token pertama Gemini (stream) 7–22 detik

| | |
|---|---|
| **Status** | **LUNAS — PR-068b (2026-09-29)** |
| **Jenis** | Kinerja / pengalaman pengguna |
| **Ditemukan** | Verifikasi manual PR-066 (2026-09-28), provider nyata |
| **Pemilik** | Belum ditetapkan — keputusan operasional (model/timeout/urutan provider) |
| **Pemicu** | Keluhan "chat lambat", atau metrik latensi PR-103 |

`streamGenerateContent` untuk `gemini-3.5-flash-lite` baru mengirim header setelah **7–22 detik**
(terukur tiga kali), lalu seluruh jawaban tiba dalam <0,5 detik — jadi bukan koneksi yang
menggantung, melainkan waktu sebelum byte pertama. `generateContent` (non-stream) untuk prompt
kecil menjawab dalam ~1 detik, jadi lambatnya khas jalur stream akun/model ini.

Akibatnya hari ini: giliran yang melewati `GEMINI_TIMEOUT_MS` (15 dtk) jatuh ke Groq SEBELUM token
pertama — benar menurut desain router stream, tetapi pengguna menunggu 15 detik dulu. Groq
(`qwen/qwen3.8-27b`) menjawab token pertama dalam ~0,25 detik.

**Pilihan yang ada (belum diputuskan):** timeout khusus stream yang lebih pendek; Groq sebagai
utama untuk chat (menyimpang dari ADR-005 — perlu catatan ADR); atau model Gemini lain setelah
diukur. Owner memilih mengganti default model saja di PR-066 (2026-09-28).

**PEMBAYARANNYA (PR-068b, keputusan owner 2026-09-29: batas token-pertama).** Pengukuran ulang
menunjukkan latensinya MELONJAK menurut waktu, bukan lambat permanen: model yang sama menjawab
token pertama ~1 dtk pada 2026-09-29 (3 kali ukur), sementara `gemini-3.5-flash` (non-lite)
timeout 40 dtk. Router stream kini membatalkan permintaan Gemini yang belum mengirim token apa pun
dalam `AI_STREAM_FIRST_TOKEN_MS` (bawaan 8 dtk) dan menyerahkannya ke Groq — hanya sebelum
token pertama, jadi aturan PR-045 tetap utuh. Gemini tetap utama (ADR-005 tidak berubah).
Diverifikasi nyata: Gemini lambat → Groq menjawab dalam 1,3 dtk; Gemini normal tetap menjawab
sendiri (0,6 dtk).

---

### U-27 — Model embedding bawaan `text-embedding-004` sudah tidak tersedia

| | |
|---|---|
| **Status** | **LUNAS — PR-069 (2026-09-30)** |
| **Jenis** | Konfigurasi / risiko fitur |
| **Ditemukan** | Verifikasi manual PR-066 (2026-09-28) |
| **Pemilik** | **PR-069** (embedding profil, Phase 11) — syarat masuk |
| **Pemicu** | Panggilan `embed` pertama |

Daftar model akun Gemini hari ini hanya memuat `gemini-embedding-001`, `gemini-embedding-2`, dan
`gemini-embedding-2-preview`; `GEMINI_EMBED_MODEL` bawaan (`text-embedding-004`) tidak ada.
**Tidak diganti di PR-066**: kolom `vector(768)` dan `AI_EMBED_DIMENSIONS = 768` (ADR-005) terikat
pada dimensinya, dan model pengganti berdimensi bawaan berbeda (perlu `outputDimensionality`).
Keputusan itu milik PR yang pertama kali memakai embedding, bukan PR chat.

Temuan sejenis yang SUDAH dibayar di PR-066: `gemini-2.0-flash` dan `llama-3.3-70b-versatile`
sama-sama 404 — artinya sejak entah kapan SEMUA jalur AI (termasuk non-stream Phase 06) mati di
lingkungan nyata tanpa satu test pun merah. Default chat diganti ke `gemini-3.5-flash-lite` /
`qwen/qwen3.8-27b` (keputusan owner). `.env` lokal yang masih menyebut model lama tetap menimpa
default — baris itu harus dihapus manual.

**PEMBAYARANNYA (PR-069, keputusan owner 2026-09-30: `gemini-embedding-001`).** Default
`GEMINI_EMBED_MODEL` diganti; adapter mengirim `outputDimensionality: 768` (+ `taskType:
SEMANTIC_SIMILARITY`) dan menormalisasi L2 hasilnya — potongan MRL tidak ternormalisasi, dan
`<->` pgvector peka panjang vektor. Kolom `vector(768)` dan `AI_EMBED_DIMENSIONS` tidak berubah.
Diverifikasi NYATA: 768 dimensi, panjang 1,000000; profil "admin gudang/Excel" berkosinus 0,94
dengan lowongan admin gudang dan 0,77 dengan lowongan koki; proses worker sungguhan menyimpan
vektornya dan menulis baris `ai_usage` (`embed`/`gemini`). **`.env` lokal yang masih berisi
`GEMINI_EMBED_MODEL=text-embedding-004` tetap menimpa default — hapus barisnya.**

---

### U-28 — AC manual Phase 10: NVDA & jaringan 3G untuk chat CV

| | |
|---|---|
| **Status** | TERBUKA — sebagian dibayar PR-068c (2026-09-29) |
| **Jenis** | Verifikasi manual |
| **Ditemukan** | PR-068 (2026-09-29) |
| **Pemilik** | Belum ditetapkan (butuh Windows + NVDA, dan API dengan kunci AI sah) |
| **Pemicu** | Sebelum rilis v1.0.0 (Phase 18), bersama U-24 |

Isi [checklist PR-068](implementation/log/pr-068-nvda-checklist.md): pengumuman per kalimat
dan fokus yang tidak berpindah pada NVDA NYATA, serta Slow 3G / putus-sambung di browser
nyata. Semua yang bisa dibuktikan mesin sudah (e2e + axe); yang tersisa adalah telinga
manusia — sifat yang sama dengan U-24.

**Dibayar sebagian — PR-068c (2026-09-29), NVDA nyata dan provider AI nyata.** Hasilnya:
* pengumuman "sedang mengetik" satu kali, lalu jawaban tanpa kalimat terulang;
* tidak ada ucapan pindah fokus;
* Slow 3G: fokus tetap;
* putus di tengah: sambung ulang dengan `Last-Event-Id`, 0 giliran dobel.

**Masih terbuka:** pintu masuk `/cv`, kuota/degradasi, finalize, putus > 1 menit, tampilan sempit,
dan aliran bertahap di bawah 3G (tidak teramati lewat throttling CDP). Semuanya ada di
[checklist PR-068](implementation/log/pr-068-nvda-checklist.md).

---

### U-29 — Vektor untuk data yang lahir SEBELUM pipeline embedding

| | |
|---|---|
| **Status** | **LUNAS — PR-069b (2026-09-30)** |
| **Jenis** | Data / kelengkapan fitur |
| **Ditemukan** | PR-069 (2026-09-30) |
| **Pemilik** | **PR-069b** (keputusan owner 2026-09-30) — **syarat masuk PR-070** |
| **Pemicu** | PR pertama yang MEMBACA vektor (PR-070, query kandidat) |

Pipeline PR-069 hanya bereaksi pada event BARU (`profile.updated`, `job.published`,
`job.updated`). Semua yang sudah ada sebelumnya tidak punya vektor dan tidak akan pernah
mendapatkannya sampai disunting: di DB dev hari ini **17 lowongan tayang dan 5 profil, 0 vektor**.
Lowongan seed juga tidak punya `createdBy`, padahal kurator pembuat adalah pemikul kuota embed
(keputusan owner) — jadi walaupun disunting, service melewatinya dengan log `error`.

Tanpa pembayaran ini PR-070 akan lulus test (fixture-nya menanam vektor sendiri) sementara feed
nyata kosong. Yang harus dibawa PR-069b:
* alat re-embed massal (juga alat "Rollback Strategy" PR-069 — "re-embed massal via job manual",
  yang sampai kini tidak ada), yang meng-enqueue `ai-embed` untuk entitas tanpa vektor dan
  **menghormati pagu global kuota** (1.200/hari);
* `createdBy` pada lowongan seed (admin seed), atau keputusan eksplisit lain atas atribusinya.

Terkait: job yang gagal final (Gemini tumbang 4× / kuota habis) juga meninggalkan entitas tanpa
vektor BARU sampai suntingan berikutnya — alat yang sama menjadi jalur pemulihannya.

**PEMBAYARANNYA (PR-069b, keputusan owner 2026-09-30).** Skrip CLI
`pnpm --filter @nawasena/api embed:ulang [--jenis=…] [--maks=N] [--jarak-ms=N] [--kering]`:
mencari lowongan aktif berkurator dan profil BERISI (akun hidup) tanpa vektor, lalu meng-enqueue
`ai-embed` dengan kunci coalescing yang SAMA dengan pemicu event. Batas per jalan bawaannya **25%
pagu global** (300 dari 1.200), lowongan didahulukan, job dijarakkan 1 dtk. Lowongan tanpa kurator
tidak diantrekan tetapi DIHITUNG dan diperingatkan ke operator. Seed kini menulis `createdBy` =
admin seed. Diverifikasi NYATA di DB dev: 17 lowongan + 4 profil diantrekan → worker + Gemini →
**17/17 lowongan tayang dan 5/5 profil bervektor**, 21 baris `ai_usage`; jalan ulang = 0.

Yang TIDAK dibayar di sini, dengan sengaja: vektor yang ADA tetapi basi (model berganti, atau
event yang hilang di jarak `emit`→`enqueue`). Alat ini hanya melihat vektor yang kosong; bila
model embedding kelak diganti, vektor lama harus dikosongkan dulu (satu `UPDATE … SET … = NULL`)
sebelum alat dijalankan — vektor dari dua model berbeda tidak sebanding.

---

### U-30 — AC manual PR-074: NVDA nyata untuk kartu feed matching

| | |
|---|---|
| **Status** | TERBUKA |
| **Jenis** | Verifikasi manual |
| **Ditemukan** | PR-074 (2026-09-30) |
| **Pemilik** | Belum ditetapkan (butuh Windows + NVDA dan desktop yang tidak dipakai) |
| **Pemicu** | Sebelum rilis v1.0.0 (Phase 18), bersama U-24 dan U-28 |

Testing Checklist PR-074 menyebut "axe + NVDA kartu". axe lulus di jsdom dan Playwright
(empat keadaan feed); yang tersisa adalah telinga manusia: urutan pembacaan kartu, pengumuman
banner status AI yang tidak mencuri fokus, dan tombol refresh `aria-disabled` beserta alasannya.
Keputusan owner 2026-09-30: dicatat, dijalankan nanti — harness `apps/web/verifikasi/` merekam
jendela yang sedang aktif, jadi butuh desktop bebas. Isi:
[checklist PR-074](implementation/log/pr-074-nvda-checklist.md).

---

## Di luar scope — JANGAN ditarik ke PR berjalan

Keputusan owner 2026-09-05. Ketiganya sudah punya pemilik yang jelas di phase-nya sendiri;
menariknya lebih awal hanya memindahkan pekerjaan, bukan menyelesaikannya.

| Utang | Pemilik | Catatan |
|---|---|---|
| Redis store untuk `express-rate-limit` (kini memory store) | **PR-105** (Phase 17) | Dampak yang sudah dicatat: hitungan tidak dibagi antar-replika (2 replika = 2× jatah) dan hilang saat restart |
| Dua klien DB berdampingan (`pg` untuk ping + Prisma) | **PR-097** (Phase 16) | Jangan menambah pemakai `pg` sementara ini |
| Sink metrik produksi (audit, `ai_cache.hit/miss`, kuota) | **PR-103** (Phase 16) | Hari ini hitungan hidup di memori proses |

---

## Log rekonsiliasi

### 2026-09-05 — rekonsiliasi pertama (setelah PR-047)

**Cara:** setiap utang yang bisa diperiksa ditelusuri ke **kode di disk**, bukan ke klaim
di log. Utang verifikasi manual (U-12..U-14) tidak bisa diperiksa dengan cara ini dan
diambil apa adanya.

**Diverifikasi LUNAS — catatannya sudah benar, tidak ada koreksi yang perlu:**

| Utang | Bukti di disk |
|---|---|
| `SELECT … FOR UPDATE` pada gerbang consent (utang PR-037 D2) | `profile.repository.ts:165` — `FOR UPDATE` lewat `Prisma.sql`; log PR-039 sudah mencatatnya lunas |
| 12 route karier + `/me/accessibility` + `/me/profile` + `/ai/quota` tak terdokumentasi di OpenAPI | Semuanya ada di `openapi.json`, dan kini dijaga `openapi-parity.test.ts` — penagih otomatis yang sebelumnya tidak ada |
| `AUTH_LOGIN_SUCCEEDED` belum dipasang di jalur OTP | Dicatat lunas di log Phase 02 (PR-021) |

**Diverifikasi MASIH TERBUKA — catatannya akurat:** U-06, U-07, U-09, U-10.

**Diverifikasi MASIH TERBUKA tetapi ALASANNYA BASI — dikoreksi hari ini:** U-03, U-04,
U-05. Ketiganya di `export-kelengkapan.test.ts`; alasan `DITUNDA`-nya ditulis ulang agar
menyebut keadaan yang sebenarnya.

**Diverifikasi LATEN (tidak bisa menggigit hari ini):** U-08.

**Ditambahkan setelah rekonsiliasi:** U-15 (2026-09-05, PR-048a) — perangkap
`prisma migrate dev` yang sudah menggigit sekali; penjaganya terpasang di PR yang sama,
sebabnya masih terbuka. U-16 (2026-09-05) — ukuran berkas ekspor, lahir sebagai
konsekuensi sadar dari pembayaran U-04.

**LUNAS 2026-09-05, atas keputusan owner:** U-03 dan U-04 dibayar di PR tersendiri
(`pdp-ekspor-preferensi-notifikasi`) — sengaja TIDAK diselundupkan ke PR-048b, sebab
mencampur kepatuhan PDP ke dalam PR push adalah pencampuran scope yang justru menjadi alasan
PR-048 dipecah. Ekspor PDP kini
memuat preferensi aksesibilitas dan riwayat notifikasi, keduanya diverifikasi end-to-end
terhadap API dev — bukan hanya lewat fake. Waktu dari temuan sampai lunas: satu hari.

**Temuan yang paling perlu keputusan:** U-03 dan U-04 bukan utang pembukuan. Ekspor data
pribadi hari ini **kurang** — preferensi aksesibilitas (ada untuk setiap pengguna sejak
Phase 04) dan riwayat notifikasi (ada sejak PR-047) tidak ikut, padahal keduanya data
pengguna yang sah dan tabelnya sudah terisi. Tidak memblokir PR-048, tetapi tidak boleh
ikut hanyut sampai Phase 18.

---

## Rekonsiliasi 2026-09-06 (setelah PR-049b merged)

Dijalankan atas perintah owner sesudah PR-049 tuntas. Metodenya sama dengan rekonsiliasi
2026-09-05: setiap utang **diperiksa terhadap kode**, bukan dibaca ulang dari catatannya
sendiri — catatan yang memeriksa dirinya sendiri tidak pernah menemukan apa pun.

**LUNAS sejak rekonsiliasi terakhir:**

* **U-11** (pemberitahuan pasca-hapus untuk akun Google-only) — dibayar PR-049a. Diverifikasi:
  `beritahuLewatEmail` di `account.service.ts` mengantre `notify-email`, dan `email.service.ts`
  mengirimnya. Utang ini terbuka sejak 2026-08-10; **27 hari** dari temuan ke lunas.

**Diverifikasi MASIH TERBUKA — dengan bukti, bukan dengan asumsi:**

| Utang | Cara diperiksa | Hasil |
|---|---|---|
| U-01 | `prettier --check "apps/api/src/**/*.ts"` | **33 berkas** akan ditulis ulang, dan `pnpm lint` tetap hijau — prettier memang tidak ditegakkan lint. Terkonfirmasi. |
| U-02 | Gerbang dijalankan ulang untuk PR-049b | Tetap terbuka; lihat "hasil gerbang kedua" di entri U-02. |
| U-05 | `export-kelengkapan.test.ts` | Atribusi sudah benar; utang pemindahan ke PR-066 tetap terbuka. |
| U-06 | `grep AiClient apps/api/src/boot.ts` | **0 kecocokan** — jalur AI belum dirakit di composition root. Terkonfirmasi. |
| U-07 | Tidak ada test yang melarang modul memanggil `createAiGateway` langsung | Terkonfirmasi. |
| U-08 | `readdirSync(PROMPTS)` di `prompt-registry.test.ts` masih tanpa `{ recursive: true }` | Terkonfirmasi laten. |
| U-09 | `OtpSender` / `OtpMessage` masih bernama demikian | Terkonfirmasi. |
| U-10 | Tidak berubah sejak Phase 02 | Terkonfirmasi. |
| U-15 | Migrasi 15 ditulis tangan; penjaganya hijau; 47 indeks utuh sesudah `migrate deploy` | Terkonfirmasi; penjaganya BEKERJA. |
| U-16 | Bagian `notifications` ekspor masih tak berpaginasi | Tidak berubah. `notificationChannels` yang ditambahkan PR-049b berukuran tetap, jadi tidak memperburuknya. |
| U-17 · U-18 | Ditunda atas keputusan owner 2026-09-06 | Tidak disentuh, sesuai perintah. |

**Ditambahkan pada rekonsiliasi ini:** U-19 (push nyata ke perangkat uji) dan U-20 (email nyata
di staging). Keduanya sudah ada sebagai prosa di log PR-048b dan PR-049a/b sejak ditemukan;
yang baru adalah **tempatnya** — owner secara eksplisit memutuskan keduanya dicatat sebagai
verifikasi manual/integrasi, bukan blocker pengembangan.

**Yang paling perlu diperhatikan dari rekonsiliasi ini — U-01 TUMBUH.** Empat berkas baru
PR-049a/b termasuk di antara 33 berkas yang akan ditulis ulang prettier. Itu bukan kelalaian
penulisnya: gaya yang ditegakkan CI (`pnpm lint`) memang bukan gaya prettier, jadi setiap PR
menambah selisihnya. Selama utang ini terbuka, `pnpm format` bukan perintah yang aman
dijalankan siapa pun — dan CLAUDE.md §10 masih mencantumkannya tanpa peringatan.

**Tidak ada utang yang statusnya keliru.** Tidak ada yang tercatat TERBUKA padahal sudah lunas,
dan tidak ada yang tercatat LUNAS padahal masih ada.

**Tidak ada blocking debt untuk PR-050.** Notification center web membaca endpoint yang sudah
ada sejak PR-047 dan tidak menyentuh satu pun jalur yang utangnya terbuka.
