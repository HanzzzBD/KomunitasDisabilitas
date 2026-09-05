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
| **Status** | TERBUKA |
| **Jenis** | Durability |
| **Ditemukan** | PR-047 (2026-09-05) |
| **Pemilik** | **PR-049 — gate masuk wajib** |
| **Pemicu** | Saat notifikasi/email menjadi jalur kabar yang lebih kritis |

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
| **Status** | TERBUKA (atribusi dikoreksi 2026-09-05) |
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
| **Status** | TERBUKA |
| **Pemilik** | PR-066 |
| **Pemicu** | Endpoint fitur AI pertama |
| **Sumber** | Log Phase 06 (PR-043b, PR-044b, PR-045, PR-046) |

`boot.ts` belum merakit `aiClient`, `createAiPromptCache`, jalur SSE, maupun pemanggil
`withDegradation`. Diverifikasi ulang 2026-09-05: masih benar — `boot.ts` hanya merakit
`createAiQuota` + `createAiModule({ quota })`. Seluruh jaminan Phase 06 karena itu hari ini
hanya sekuat test-nya; belum ada satu pun yang berjalan di produksi.

---

### U-07 — Seam F1: tidak ada penjaga struktural atas `createAiGateway`

| | |
|---|---|
| **Status** | TERBUKA |
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
| **Status** | TERBUKA |
| **Pemilik** | **PR-049** |
| **Sumber** | Log Phase 03 |

Pengguna yang masuk lewat Google dan menghapus akunnya tidak menerima konfirmasi apa pun.
**Terkait langsung dengan U-02:** ini contoh nyata peristiwa yang kabarnya hanya lewat satu
kanal — pengguna itu sudah tidak punya akun, jadi tidak punya layar untuk melihatnya.
Kehilangan email di sini bukan kehilangan pemberitahuan, melainkan satu-satunya bukti bahwa
permintaan hapusnya diproses. Harus dinilai di gate U-02.

---

### U-12 · U-13 · U-14 — Utang verifikasi manual

| ID | Utang | Sumber | Kenapa belum |
|---|---|---|---|
| U-12 | **NVDA sampling** untuk lima komponen (Dialog, Toast, Kerangka, Tab, Kartu) + tiga halaman auth | Log Phase 03 (PR-027/028/030/032a/033) | Menuntut manusia + alat; seluruh klaim "diumumkan" bersandar pada struktur ARIA, bukan pendengaran alat sungguhan |
| U-13 | **Review copy oleh non-engineer** | Log Phase 03 (PR-029) | Paket teks sudah disiapkan, belum ada yang mereview |
| U-14 | **AC PR-030 #1** — login OTP end-to-end | Log Phase 03 | Menunggu kredensial provider OTP |

Ketiganya **tidak bisa diverifikasi dari disk** dan karena itu tidak ikut direkonsiliasi
2026-09-05. Statusnya diambil apa adanya dari log terakhir yang menyebutnya.

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
