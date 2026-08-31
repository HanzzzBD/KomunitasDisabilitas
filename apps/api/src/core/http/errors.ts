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
