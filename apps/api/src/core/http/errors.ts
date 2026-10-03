// core/http — katalog kode error terpusat (SDD §11; mitigasi risiko PR-007:
// enum terpusat, bukan string literal tersebar di modul).
//
// ATURAN:
// - Semua error API dibuat via appError("KODE") — jangan res.status().json()
//   manual di controller.
// - message = Bahasa Indonesia sederhana (dibacakan screen reader apa adanya);
//   hint = saran tindakan untuk pengguna.
// - Kode baru WAJIB ditambahkan di sini (test memvalidasi format & kelengkapan).
import type { ErrorEnvelope } from "@nawasena/schemas";

export interface CatalogEntry {
  status: number;
  message: string;
  hint?: string;
}

export const ERROR_CATALOG = {
  VALIDATION_ERROR: {
    status: 400,
    message: "Input tidak valid",
    hint: "Periksa kembali data yang Anda isi",
  },
  JSON_TIDAK_VALID: {
    status: 400,
    message: "Format data yang dikirim rusak",
    hint: "Coba ulangi; laporkan bila terus terjadi",
  },
  TIDAK_TERAUTENTIKASI: {
    status: 401,
    message: "Anda belum masuk",
    hint: "Silakan masuk terlebih dahulu",
  },
  TIDAK_BERHAK: {
    status: 403,
    message: "Anda tidak berhak mengakses ini",
    hint: "Hubungi admin bila Anda merasa seharusnya punya akses",
  },
  // 403 (PR-083): login/refresh akun yang ditangguhkan admin. Muncul HANYA
  // sesudah kode OTP / identitas Google terbukti — orang lain yang mengetik
  // nomornya tidak pernah tahu status akun. `hint` diganti saat dilempar dengan
  // alamat banding dari env SUPPORT_EMAIL. Alasan admin TIDAK disertakan.
  AKUN_DITANGGUHKAN: {
    status: 403,
    message: "Akun Anda sedang ditangguhkan",
    hint: "Hubungi tim Nawasena bila menurut Anda ini keliru",
  },
  RUTE_TIDAK_DITEMUKAN: {
    status: 404,
    message: "Halaman atau data tidak ditemukan",
    hint: "Periksa kembali alamat yang Anda tuju",
  },
  TERLALU_BANYAK_PERMINTAAN: {
    status: 429,
    message: "Terlalu banyak permintaan",
    hint: "Tunggu sebentar, lalu coba lagi",
  },
  // --- Alur OTP (PR-016) ---
  KODE_OTP_SALAH: {
    status: 401,
    message: "Kode yang Anda masukkan salah",
    hint: "Periksa kembali kode dari WhatsApp atau SMS",
  },
  KODE_OTP_HANGUS: {
    status: 410,
    message: "Kode sudah tidak berlaku",
    hint: "Minta kode baru, lalu masukkan dalam 5 menit",
  },
  TERLALU_BANYAK_PERCOBAAN: {
    status: 429,
    message: "Terlalu banyak percobaan kode",
    hint: "Tunggu sesuai waktu yang diberitahukan, lalu minta kode baru",
  },
  // --- Login Google (PR-017) ---
  // Dipisah dari kode OTP dengan sengaja: pengguna yang gagal masuk lewat
  // Google butuh saran yang berbeda ("coba lagi dari awal") dibanding kode OTP.
  GOOGLE_EXCHANGE_GAGAL: {
    status: 401,
    message: "Masuk dengan Google tidak berhasil",
    hint: "Ulangi dari tombol Masuk dengan Google; tautan masuk hanya berlaku sekali",
  },
  TOKEN_GOOGLE_TIDAK_VALID: {
    status: 401,
    message: "Data masuk dari Google tidak sah",
    hint: "Ulangi dari tombol Masuk dengan Google",
  },
  // PR-020a: alamat dari Google dipegang akun lain yang belum membuktikannya.
  // Hint-nya mengarahkan ke OTP, bukan sekadar menolak: jalur itu tetap terbuka
  // penuh, jadi pengguna TIDAK terkunci dari platform — dan bagi pengguna yang
  // memang pemilik kedua-duanya, itu memang langkah yang benar.
  EMAIL_GOOGLE_DIKLAIM_AKUN_LAIN: {
    status: 409,
    message: "Email Google Anda sudah terdaftar lewat cara lain",
    hint: "Masuk dengan kode OTP memakai nomor HP Anda; hubungi kami bila Anda tidak mengenali akun itu",
  },
  EMAIL_GOOGLE_BELUM_TERVERIFIKASI: {
    status: 403,
    message: "Email Google Anda belum terverifikasi",
    hint: "Verifikasi email di akun Google Anda, lalu coba lagi — atau masuk dengan kode OTP",
  },
  // --- Sesi JWT (PR-018) ---
  // Dipisah dari TIDAK_TERAUTENTIKASI ("Anda belum masuk"): pengguna yang
  // sesinya berakhir SUDAH pernah masuk, dan pesan yang menyangkal itu
  // membingungkan. Satu kode untuk SEMUA penolakan refresh — kedaluwarsa,
  // tidak dikenal, sudah dicabut, atau reuse — sebab membedakannya kepada
  // klien hanya berguna bagi penebak.
  SESI_TIDAK_VALID: {
    status: 401,
    message: "Sesi Anda sudah berakhir",
    hint: "Silakan masuk lagi untuk melanjutkan",
  },
  // Utang U-10 (2026-10-01): token yang BARU SAJA dirotasi (≤ jendela toleransi)
  // dipakai lagi — hampir selalu balapan sah (dua tab, pemulihan boot vs refresh
  // 401), bukan pencurian. Keluarga TIDAK dicabut dan tidak ada token baru;
  // klien mencoba lagi dengan cookie/token terbaru (`refreshSesiToleran`,
  // api-client). Satu-satunya pengecualian atas "satu kode untuk semua
  // penolakan" di atas, dan yang dibocorkannya hanya "token ini baru saja
  // dirotasi" — kepada pemegang token yang memang sudah tidak berlaku.
  SESI_SUDAH_DIROTASI: {
    status: 401,
    message: "Sesi Anda sedang diperbarui",
    hint: "Coba lagi sebentar",
  },
  // --- Profil akun (PR-020) ---
  // 409, bukan 400: bentuk inputnya sah — yang bentrok adalah keadaan dunia.
  // Pesannya sengaja TIDAK memastikan bahwa ada akun lain dengan email itu;
  // kalimat "sudah terdaftar" akan menjadikan endpoint ini alat memeriksa siapa
  // saja yang punya akun di Nawasena.
  EMAIL_TIDAK_BISA_DIPAKAI: {
    status: 409,
    message: "Email ini tidak bisa dipakai",
    hint: "Coba email lain, atau masuk dengan email tersebut bila itu milik Anda",
  },
  // --- Hapus akun (PR-021) ---
  // Pemanggil sudah terbukti pemilik sesi, jadi memberitahunya kredensial apa
  // yang dipunyai akunnya BUKAN kebocoran — dan tanpa itu ia hanya bisa
  // menebak-nebak cara mengonfirmasi. Hint diisi kontekstual oleh service.
  CARA_KONFIRMASI_TIDAK_COCOK: {
    status: 400,
    message: "Cara konfirmasi itu tidak bisa dipakai untuk akun Anda",
    hint: "Gunakan cara konfirmasi yang tersedia untuk akun Anda",
  },
  // Consent Google-nya sah, tetapi milik akun Google yang BERBEDA. Dibedakan
  // dari "token tidak valid" dengan sengaja: penyebabnya hampir selalu salah
  // pilih akun di layar Google, dan pesan yang menyebutnya membuat pengguna
  // tahu harus berbuat apa.
  KONFIRMASI_GOOGLE_BEDA_AKUN: {
    status: 403,
    message: "Akun Google yang Anda pakai berbeda dengan akun ini",
    hint: "Ulangi dan pilih akun Google yang Anda pakai untuk masuk ke Nawasena",
  },
  // Tidak ada satu pun kredensial yang bisa diverifikasi (mis. login Google
  // belum dikonfigurasi di server). Menolak penghapusan lebih baik daripada
  // menjalankannya tanpa pembuktian — tetapi hak hapus PDP tidak boleh mati
  // karenanya, jadi hint mengarahkan ke jalur manusia.
  KONFIRMASI_TIDAK_TERSEDIA: {
    status: 503,
    message: "Kami belum bisa memastikan identitas Anda saat ini",
    hint: "Coba lagi beberapa saat, atau hubungi kami untuk dibantu menghapus akun",
  },
  // --- Profil pencari kerja (PR-037) ---
  // 403, bukan 400: bentuk inputnya sah dan pengguna memang berhak atas
  // profilnya sendiri — yang belum ada adalah IZIN untuk menyimpan kelas data
  // ini (UU PDP 27/2022 menuntut consent terpisah dan eksplisit).
  //
  // Pesannya sengaja tidak berbunyi "Anda tidak berhak": pengguna TIDAK sedang
  // melakukan sesuatu yang terlarang, ia hanya belum menyetujui sesuatu yang
  // memang haknya untuk tidak setujui. Kalimat yang menuduh pada langkah
  // seperti ini adalah cara tercepat membuat orang berhenti mengisi profilnya.
  CONSENT_SENSITIF_DIPERLUKAN: {
    status: 403,
    message: "Kami belum boleh menyimpan data disabilitas Anda",
    hint: "Centang dulu persetujuan penyimpanan data disabilitas, lalu simpan lagi",
  },
  // --- Akses data sensitif non-pemilik (PR-039) ---
  // 403, bukan 400: bentuk permintaannya sah dan pemanggilnya memang berhak
  // (RBAC sudah meloloskannya) — yang belum dipenuhi adalah SYARAT membaca
  // kelas data ini, yaitu menyatakan alasannya. Pesannya berbicara kepada
  // operator, bukan kepada pengguna: satu-satunya yang bisa menerimanya adalah
  // orang yang memanggil jalur support/disclosure.
  ALASAN_AKSES_DIPERLUKAN: {
    status: 403,
    message: "Akses data disabilitas harus menyertakan alasan",
    hint: "Tulis alasan singkat (maksimal 200 karakter), lalu ulangi permintaan",
  },
  // --- Kuota AI (PR-043, SDD §7.1) ---
  // 429, bukan 403: permintaannya sah dan pemanggilnya berhak — yang habis
  // adalah JATAH HARIAN-nya, dan jatah selalu kembali. Karena itu error ini
  // SELALU dibuat dengan `retryAfterSeconds` (detik menuju tengah malam WIB),
  // supaya klien tahu kapan boleh mencoba lagi alih-alih menebak.
  //
  // Satu kode untuk tiga penolakan berbeda — jatah pribadi habis, pagu harian
  // global tercapai, dan penghitung kuota tidak bisa dibaca (fail closed).
  // Membedakannya kepada klien tidak mengubah satu pun tindak lanjutnya
  // (tunggu, atau pakai jalur non-AI), sedangkan menyebut "pagu global" kepada
  // pengguna justru memberi tahu penyalahguna bahwa anggaran sedang tipis.
  // Yang membedakan tetap terbaca manusia lewat `message`/`hint` kontekstual.
  KUOTA_AI_HABIS: {
    status: 429,
    message: "Jatah bantuan AI Anda hari ini sudah habis",
    hint: "Coba lagi besok, atau lanjutkan tanpa bantuan AI",
  },
  // --- Perusahaan (PR-051) ---
  PERUSAHAAN_TIDAK_DITEMUKAN: {
    status: 404,
    message: "Perusahaan tidak ditemukan",
    hint: "Periksa kembali tautan atau ID perusahaan",
  },
  // --- Lowongan (PR-055) ---
  LOWONGAN_TIDAK_DITEMUKAN: {
    status: 404,
    message: "Lowongan tidak ditemukan",
    hint: "Periksa kembali tautan atau ID lowongan",
  },
  // 409, bukan 400: bentuk permintaannya sah — yang bentrok adalah KEADAAN
  // lowongan saat ini (mis. publish lowongan yang sudah closed, close
  // lowongan yang masih draft). State machine draft→published→closed hanya
  // mengizinkan dua transisi maju, tidak ada jalan mundur.
  TRANSISI_STATUS_TIDAK_VALID: {
    status: 409,
    message: "Lowongan tidak bisa berpindah ke status itu dari status saat ini",
    hint: "Periksa kembali status lowongan ini sebelum mencoba lagi",
  },
  // 422: bentuk permintaannya sah (publish tanpa badan sama sekali) tetapi
  // lowongannya belum lengkap untuk diterbitkan — AC PR-055 eksplisit.
  AKOMODASI_LOWONGAN_KOSONG: {
    status: 422,
    message: "Lowongan ini belum mencantumkan akomodasi apa pun",
    hint: "Tambahkan minimal satu akomodasi lewat PUT sebelum menerbitkan lowongan",
  },
  // 409: DB (FK Restrict, SDD §6.1) sudah menolak penghapusannya — pesan ini
  // menerjemahkan constraint itu, bukan mengarang aturan baru. "close" adalah
  // jalur resmi menyingkirkan lowongan yang sudah berlamaran.
  LOWONGAN_BERLAMARAN_TIDAK_BISA_DIHAPUS: {
    status: 409,
    message: "Lowongan ini sudah punya pelamar dan tidak bisa dihapus",
    hint: "Tutup lowongan (status closed) sebagai gantinya",
  },
  // --- CV / resumes (PR-060) ---
  CV_TIDAK_DITEMUKAN: {
    status: 404,
    message: "CV tidak ditemukan",
    hint: "Mungkin sudah dihapus. Muat ulang daftar CV Anda, lalu coba lagi",
  },
  // 409, bukan 400: bentuk permintaannya sah — yang bentrok adalah KEADAAN akun
  // saat ini (sudah punya CV sebanyak batasnya). Pesannya menyebutkan jalan
  // keluar yang benar-benar ada, sebab pengguna yang hanya diberi tahu "batas
  // tercapai" tidak punya langkah berikutnya.
  BATAS_CV_TERCAPAI: {
    status: 409,
    message: "Jumlah CV Anda sudah mencapai batas",
    hint: "Hapus salah satu CV lama sebelum membuat yang baru",
  },
  // 409: database (FK `applications.resume_id`, onDelete NoAction — SDD §6.1)
  // sudah menolak penghapusannya. Pesan ini menerjemahkan penolakan itu, bukan
  // mengarang aturan baru. Menghapus akun tetap membersihkan semuanya lewat
  // cascade dari `users`; yang ditolak hanya penghapusan satu CV yang sedang
  // menjadi lampiran lamaran yang sudah terkirim.
  CV_DIPAKAI_LAMARAN: {
    status: 409,
    message: "CV ini sedang dipakai pada lamaran yang sudah Anda kirim",
    hint: "Buat CV baru bila ingin mengubah isinya, atau ubah CV ini tanpa menghapusnya",
  },
  // --- Lamaran / apply (PR-075) ---
  // 400: header wajib (keputusan owner 2026-10-01). Klien resmi selalu
  // mengirimnya; yang menerima pesan ini adalah pengembang klien, bukan
  // pelamar — tetapi tetap ditulis sederhana, sebab ia bisa sampai ke layar.
  IDEMPOTENCY_KEY_DIPERLUKAN: {
    status: 400,
    message: "Permintaan melamar tidak lengkap",
    hint: "Muat ulang halaman, lalu coba lamar lagi",
  },
  // 422: kunci yang SAMA dipakai untuk lowongan BERBEDA. Memutar ulang
  // respons lama di sini akan memberi tahu klien bahwa lamaran ke lowongan
  // kedua berhasil, padahal tidak pernah dibuat.
  IDEMPOTENCY_KEY_BENTROK: {
    status: 422,
    message: "Permintaan ini bentrok dengan lamaran lain",
    hint: "Muat ulang halaman, lalu coba lamar lagi",
  },
  // 409: permintaan pertama dengan kunci yang sama masih berjalan. Hint-nya
  // menenangkan — klik ganda pada koneksi lambat adalah penyebab terlazim.
  LAMARAN_SEDANG_DIPROSES: {
    status: 409,
    message: "Lamaran Anda sedang dikirim",
    hint: "Tunggu sebentar. Anda tidak perlu menekan tombol lagi",
  },
  // 409: unique (user_id, job_id) menolak — lamaran ke lowongan ini sudah ada.
  SUDAH_MELAMAR: {
    status: 409,
    message: "Anda sudah melamar lowongan ini",
    hint: "Lihat status lamaran Anda di halaman Lamaran Saya",
  },
  // 422: pelamar memilih mengungkap, tetapi tidak ada data untuk diungkap
  // (consent belum diberikan, atau ragam & akomodasi masih kosong). Menyimpan
  // lamaran "ber-disclose" yang kosong akan menyesatkan admin.
  DATA_DISABILITAS_KOSONG: {
    status: 422,
    message: "Belum ada data disabilitas untuk dikirim",
    hint: "Isi data disabilitas di profil Anda, atau lamar tanpa mengirimnya",
  },
  // --- Pipeline status lamaran (PR-076) ---
  // 404 juga untuk lamaran milik orang lain — alasan yang sama dengan
  // CV_TIDAK_DITEMUKAN: membedakannya memberi tahu siapa melamar ke mana.
  // --- Moderasi pengguna (PR-083) ---
  PENGGUNA_TIDAK_DITEMUKAN: {
    status: 404,
    message: "Pengguna tidak ditemukan",
    hint: "Muat ulang daftar pengguna, lalu coba lagi",
  },
  // 422: sasaran bukan pencari kerja (admin tidak saling mengunci — keputusan
  // owner 2026-10-03), atau admin mencoba menangguhkan dirinya sendiri.
  PENGGUNA_TIDAK_BISA_DIMODERASI: {
    status: 422,
    message: "Akun ini tidak bisa ditangguhkan",
    hint: "Hanya akun pencari kerja yang bisa ditangguhkan",
  },
  // 409: sudah dalam keadaan yang diminta (ditangguhkan dua kali / pulihkan
  // akun aktif) — biasanya admin lain baru saja melakukannya.
  STATUS_PENGGUNA_TIDAK_BERUBAH: {
    status: 409,
    message: "Status akun ini sudah berubah",
    hint: "Muat ulang daftar pengguna untuk melihat status terbaru",
  },
  // --- Kamus video BISINDO (PR-084) ---
  VIDEO_ISYARAT_TIDAK_DITEMUKAN: {
    status: 404,
    message: "Video isyarat tidak ditemukan",
    hint: "Muat ulang daftar kamus, lalu coba lagi",
  },
  // 422: caption & transkrip adalah kontrol aksesibilitas (SDD §7.4), bukan
  // pelengkap. `hint` diganti saat dilempar dengan daftar yang masih kurang.
  VIDEO_ISYARAT_BELUM_LENGKAP: {
    status: 422,
    message: "Video isyarat ini belum lengkap untuk diterbitkan",
    hint: "Lengkapi video, caption (.vtt), dan transkrip terlebih dahulu",
  },
  // 422: key bukan milik video ini (`sign-videos/{id}/...`) atau ekstensinya
  // tidak cocok dengan jenis medianya.
  MEDIA_VIDEO_ISYARAT_TIDAK_VALID: {
    status: 422,
    message: "Berkas media tidak cocok untuk video isyarat ini",
    hint: "Unggah ulang berkasnya lewat halaman kamus, lalu simpan lagi",
  },
  // 409: diterbitkan dua kali — biasanya admin lain baru saja menerbitkannya.
  VIDEO_ISYARAT_SUDAH_TERBIT: {
    status: 409,
    message: "Video isyarat ini sudah diterbitkan",
    hint: "Muat ulang daftar kamus untuk melihat status terbaru",
  },
  LAMARAN_TIDAK_DITEMUKAN: {
    status: 404,
    message: "Lamaran tidak ditemukan",
    hint: "Muat ulang daftar lamaran Anda, lalu coba lagi",
  },
  // 409: bentuk permintaannya sah, yang bentrok adalah KEADAAN lamaran
  // (mis. withdraw lamaran yang sudah ditolak, atau status berubah di antara
  // dua klik). Hint-nya mengarah ke status terbaru, bukan menyalahkan.
  STATUS_LAMARAN_TIDAK_VALID: {
    status: 409,
    message: "Lamaran ini tidak bisa diubah dari statusnya sekarang",
    hint: "Muat ulang lamaran untuk melihat statusnya yang terbaru",
  },
  // --- Admin lamaran (PR-077a) ---
  // 404, bukan 403: pemanggilnya admin yang sah — yang tidak ada adalah DATA
  // yang diungkap, karena pelamar memilih tidak mengungkapnya. Pesannya
  // menyebut pilihan itu supaya admin tidak mengira ada yang rusak.
  DATA_TIDAK_DIUNGKAP: {
    status: 404,
    message: "Pelamar memilih tidak mengungkap data disabilitas pada lamaran ini",
    hint: "Hormati pilihan pelamar; teruskan lamaran tanpa data tersebut",
  },
  // --- Sesi AI CV Builder (PR-065) ---
  // 404 juga untuk sesi milik orang lain — alasannya sama dengan CV_TIDAK_DITEMUKAN.
  AI_SESI_TIDAK_DITEMUKAN: {
    status: 404,
    message: "Percakapan tidak ditemukan",
    hint: "Mungkin sudah lewat 30 hari dan dihapus. Mulai percakapan baru, atau isi formulir CV",
  },
  // 409: bentuk permintaannya sah, yang bentrok adalah KEADAAN sesi. Sesi yang
  // sudah menjadi draft CV tidak menerima giliran baru — menambahkannya akan
  // membuat transkrip berbeda dari draft yang sudah diekstrak darinya.
  AI_SESI_SUDAH_SELESAI: {
    status: 409,
    message: "Percakapan ini sudah selesai",
    hint: "Buka draft CV Anda untuk memeriksanya, atau mulai percakapan baru",
  },
  // 409, bukan 413: yang penuh adalah SESINYA, bukan permintaan ini. Pesannya
  // menyebut dua jalan keluar yang benar-benar ada — tidak ada yang hilang,
  // percakapan yang sudah terjadi tetap bisa dijadikan draft CV.
  AI_TRANSKRIP_PENUH: {
    status: 409,
    message: "Percakapan ini sudah terlalu panjang",
    hint: "Selesaikan percakapan untuk membuat draft CV, lalu lengkapi lewat formulir",
  },
  // --- Finalize AI CV Builder (PR-067) ---
  // 409: draft CV sedang dibuat dari percakapan ini. Giliran baru akan membuat
  // transkrip berbeda dari yang sedang diekstrak.
  AI_SESI_SEDANG_DIFINALISASI: {
    status: 409,
    message: "Draft CV sedang dibuat dari percakapan ini",
    hint: "Tunggu sebentar. Anda akan diberi tahu saat draft siap",
  },
  // 409: finalize tanpa satu pun jawaban pengguna hanya akan menghasilkan CV
  // kosong — dan memakan satu jatah finalize untuk itu.
  AI_SESI_KOSONG: {
    status: 409,
    message: "Percakapan ini belum berisi jawaban Anda",
    hint: "Jawab beberapa pertanyaan dulu, atau isi CV lewat formulir biasa",
  },
  // --- Percakapan AI CV Builder (PR-066) ---
  // 409: satu sesi hanya boleh punya SATU jawaban yang sedang mengalir. Pesan
  // kedua yang tiba sebelum jawaban pertama selesai akan membuat dua jawaban
  // saling menyela di transkrip yang sama.
  AI_SEDANG_MENJAWAB: {
    status: 409,
    message: "Pewawancara masih menjawab pesan sebelumnya",
    hint: "Tunggu jawabannya selesai, lalu kirim pesan berikutnya",
  },
  // 404 untuk sambung ulang yang datang terlambat. Bukan kehilangan: jawabannya
  // sudah tersimpan di transkrip, dan hint-nya menunjuk ke sana.
  AI_ALIRAN_TIDAK_ADA: {
    status: 404,
    message: "Jawaban ini sudah tidak bisa disambung lagi",
    hint: "Muat ulang percakapan untuk melihat jawaban yang sudah tersimpan",
  },
  // 503 + degradasi: fitur dimatikan operator (rollback PR-066) — klien
  // beralih ke formulir CV biasa, bukan menampilkan galat.
  AI_CHAT_DIMATIKAN: {
    status: 503,
    message: "Chat AI sedang tidak tersedia",
    hint: "Anda tetap bisa membuat CV lewat formulir biasa",
  },
  // 503 + degradasi: plafon aliran serentak tercapai (penyangga sambung-ulang
  // hidup di memori proses, jadi jumlahnya harus dibatasi).
  AI_CHAT_SIBUK: {
    status: 503,
    message: "Chat AI sedang ramai",
    hint: "Coba lagi sebentar lagi, atau lanjutkan lewat formulir CV biasa",
  },
  TERJADI_KESALAHAN: {
    status: 500,
    message: "Terjadi kesalahan pada server",
    hint: "Coba lagi beberapa saat; laporkan bila terus terjadi",
  },
  BELUM_SIAP: {
    status: 503,
    message: "Layanan sedang tidak siap",
    hint: "Tunggu sebentar, lalu coba lagi",
  },
} as const satisfies Record<string, CatalogEntry>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

/** Override opsional saat membuat error: pesan/hint kontekstual + Retry-After. */
export interface AppErrorOverrides extends Partial<Pick<CatalogEntry, "message" | "hint">> {
  /**
   * Detik yang harus ditunggu klien; error handler global menuliskannya sebagai
   * header `Retry-After` (SDD §11 — 429 selalu memberi tahu kapan boleh coba lagi).
   */
  retryAfterSeconds?: number;
}

/** Error aplikasi ber-kode katalog; dilempar dari layer mana pun. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly hint?: string;
  readonly retryAfterSeconds?: number;

  constructor(code: ErrorCode, overrides?: AppErrorOverrides) {
    const entry: CatalogEntry = ERROR_CATALOG[code];
    super(overrides?.message ?? entry.message);
    this.name = "AppError";
    this.code = code;
    this.status = entry.status;
    this.hint = overrides?.hint ?? entry.hint;
    this.retryAfterSeconds = overrides?.retryAfterSeconds;
  }

  get envelope(): ErrorEnvelope {
    return { code: this.code, message: this.message, hint: this.hint };
  }
}

/** Cara baku membuat error: appError("TIDAK_BERHAK") / dengan override hint. */
export function appError(code: ErrorCode, overrides?: AppErrorOverrides): AppError {
  return new AppError(code, overrides);
}
