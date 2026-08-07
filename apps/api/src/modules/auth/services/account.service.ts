// modules/auth — hapus akun: konfirmasi ulang identitas + soft delete (PR-021).
//
// KENAPA MINTA BUKTI LAGI PADAHAL SUDAH ADA SESI. Access token berumur 15 menit
// dan diperbarui diam-diam selama refresh token masih hidup, jadi "punya sesi"
// hanya membuktikan bahwa perangkat ini PERNAH dipakai masuk — bukan bahwa
// orang yang menekan tombol sekarang adalah pemiliknya. Untuk aksi yang
// menghapus seluruh data seseorang, itu tidak cukup. Yang diminta di sini
// adalah kredensial ASLI, sekali lagi, saat itu juga.
//
// DUA JALUR KARENA ADA DUA KREDENSIAL — dan tidak ada password sama sekali:
// pemilik nomor membuktikan diri dengan kode OTP baru, pengguna Google dengan
// consent Google baru yang klaim `sub`-nya dicocokkan dengan `google_id` akun.
// Menyediakan satu jalur saja berarti sebagian pengguna tidak akan pernah bisa
// memakai hak hapus UU PDP (PRD FR-1.4) lewat aplikasi.
//
// PENGHAPUSANNYA SENDIRI SATU TRANSAKSI (lihat userRepository.deleteAccount):
// `deleted_at` + `token_version` + pencabutan seluruh refresh token berhasil
// bersama-sama atau tidak sama sekali.
import { AUDIT_ACTION, type DeleteAccount, type GoogleReauth } from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import { appError } from "../../../core/http/index.js";
import type { Logger } from "../../../core/logger/index.js";
import type { AuthUserRepository } from "../repositories/user.repository.js";
import type { GoogleIdTokenVerifier } from "./google-id-token.js";
import type { GoogleCodeExchange } from "./google-token.js";
import type { OtpSender } from "./otp-sender.js";
import type { OtpService } from "./otp.service.js";

/** Entitas audit modul ini (tanpa PII — nomor/email/googleId tidak pernah ikut). */
const AUDIT_ENTITY = "auth.account";

/** Hari sebelum data dihapus permanen (SDD §6.4; ditegakkan job purge PR-023). */
export const HARI_SEBELUM_PURGE = 30;

/**
 * Pemberitahuan bahwa akun sudah dihapus, dikirim ke nomor terdaftar.
 *
 * KENAPA INI PENTING DAN BUKAN SEKADAR SOPAN SANTUN. Penghapusan bersifat soft
 * selama 30 hari justru supaya yang keliru bisa dibatalkan. Jendela itu tidak
 * ada gunanya kalau pemiliknya baru tahu di hari ke-29 — dan orang yang akunnya
 * dihapus tidak punya alasan untuk mencoba masuk lagi dalam waktu dekat.
 *
 * Isi pesan sengaja memuat tiga hal saja: apa yang terjadi, sampai kapan bisa
 * dibatalkan, dan apa yang harus dilakukan bila ini bukan dia. Tidak ada tautan
 * — pesan yang meminta orang mengeklik sesuatu tepat setelah kejadian
 * mencurigakan adalah bentuk yang sama dengan phishing.
 */
export function buildAccountDeletedMessage(): string {
  return (
    "Akun Nawasena Anda sudah dihapus. " +
    `Data Anda masih bisa dipulihkan dalam ${HARI_SEBELUM_PURGE} hari. ` +
    "Bila ini bukan Anda, segera hubungi kami lewat kanal resmi Nawasena."
  );
}

/** Cara pembuktian yang dipakai; ikut ke audit. */
export type MetodeKonfirmasi = "otp" | "google";

/** Konteks pemanggil — userId datang dari sesi, tidak pernah dari input. */
export interface AccountActor {
  userId: string;
  requestId: string;
}

export interface AccountServiceDeps {
  userRepository: AuthUserRepository;
  /**
   * Pembuktian kode OTP. undefined = OTP_HASH_SECRET belum di-set, sehingga
   * jalur ini tertutup — sama seperti endpoint OTP itu sendiri.
   */
  otp?: Pick<OtpService, "konfirmasiKode">;
  /** undefined = kredensial Google belum di-set → jalur Google tertutup. */
  google?: { exchange: GoogleCodeExchange; verifier: GoogleIdTokenVerifier };
  /**
   * Kanal WhatsApp/SMS untuk pemberitahuan pasca-hapus. undefined = tidak ada
   * provider; penghapusan tetap berjalan, hanya pemberitahuannya yang tidak
   * terkirim. Ia jaring pengaman, bukan syarat.
   */
  sender?: OtpSender;
  auditLog: AuditLog;
  logger?: Pick<Logger, "warn">;
  /** Sumber waktu; disuntik test. */
  clock?: () => Date;
}

export function createAccountService(deps: AccountServiceDeps) {
  const { userRepository, otp, google, sender, auditLog } = deps;
  const now = deps.clock ?? (() => new Date());

  /**
   * Saran yang diberikan saat pengguna memilih cara yang tidak dimilikinya.
   * Ditulis dari SUDUT PANDANG pengguna, bukan dari sudut pandang data: ia
   * tidak tahu istilah "google_id", ia hanya tahu bagaimana biasanya masuk.
   */
  function saranCara(punyaNomor: boolean, punyaGoogle: boolean): string {
    if (punyaNomor) return "Minta kode OTP ke nomor HP Anda, lalu masukkan kodenya";
    if (punyaGoogle) return "Konfirmasi lewat akun Google yang Anda pakai untuk masuk";
    return "Hubungi kami untuk dibantu menghapus akun";
  }

  /** Kode OTP baru ke nomor terdaftar. Tangga lockout dipakai bersama login. */
  async function buktikanLewatOtp(
    phone: string | null,
    punyaGoogle: boolean,
    code: string,
    actor: AccountActor,
  ): Promise<void> {
    if (phone === null) {
      throw appError("CARA_KONFIRMASI_TIDAK_COCOK", {
        message: "Akun Anda tidak punya nomor HP untuk dikirimi kode",
        hint: saranCara(false, punyaGoogle),
      });
    }
    // Fitur OTP mati di server → JANGAN diam-diam melewatkan pembuktian.
    if (otp === undefined) throw appError("KONFIRMASI_TIDAK_TERSEDIA");
    await otp.konfirmasiKode(phone, code, { requestId: actor.requestId });
  }

  /**
   * Consent Google baru. Yang dipakai HANYA klaim `sub`: alamat email di
   * id_token tidak boleh menjadi dasar apa pun di sini — email bisa berpindah
   * antar akun Google, `sub` tidak (alasan yang sama dengan PR-017 langkah 1).
   */
  async function buktikanLewatGoogle(
    googleId: string | null,
    punyaNomor: boolean,
    input: GoogleReauth,
  ): Promise<void> {
    if (googleId === null) {
      throw appError("CARA_KONFIRMASI_TIDAK_COCOK", {
        message: "Akun Anda tidak tertaut ke Google",
        hint: saranCara(punyaNomor, false),
      });
    }
    if (google === undefined) throw appError("KONFIRMASI_TIDAK_TERSEDIA");

    const idToken = await google.exchange.exchange(input);
    const identitas = await google.verifier.verify(idToken);
    if (identitas.googleId !== googleId) {
      // Consent-nya sah, tetapi milik akun Google lain. Hampir selalu salah
      // pilih akun di layar Google — bukan serangan — jadi pesannya menyebut
      // penyebabnya alih-alih menolak dengan "tidak valid" yang buntu.
      throw appError("KONFIRMASI_GOOGLE_BEDA_AKUN");
    }
  }

  /**
   * Kirim pemberitahuan pasca-hapus. TIDAK ditunggu, dan kegagalannya TIDAK
   * pernah menjatuhkan permintaan — akunnya sudah terhapus, dan membalas
   * kesalahan pada titik ini akan membuat pengguna mengira penghapusannya gagal
   * lalu mencobanya lagi. Pola yang sama dengan `auditLog` (core/audit).
   *
   * Menunggu pengiriman juga bukan pilihan: satu panggilan provider bisa
   * memakan sampai 10 detik, dan itu 10 detik pengguna menatap layar yang
   * menggantung setelah menekan tombol paling final di seluruh aplikasi.
   *
   * Akun tanpa nomor (masuk lewat Google) tidak menerima apa pun — celah nyata
   * yang tertutup begitu ada kanal email.
   */
  function beritahuPemilik(phone: string | null): void {
    if (phone === null || sender === undefined) return;
    void sender.send({ phone, text: buildAccountDeletedMessage() }).catch((err: unknown) => {
      // Nomor tujuan TIDAK ikut: ia PII, dan yang berguna saat menyelidiki
      // adalah provider mana yang gagal, bukan siapa yang tidak menerimanya.
      deps.logger?.warn(
        { provider: sender.name, alasan: err instanceof Error ? err.message : "tidak dikenal" },
        "Pemberitahuan hapus akun gagal terkirim",
      );
    });
  }

  return {
    /**
     * DELETE /auth/account — konfirmasi, lalu hapus (soft) beserta seluruh sesi.
     *
     * Mengembalikan jumlah sesi yang dicabut untuk audit; controller tidak
     * menyerahkannya ke klien (204 tanpa body).
     */
    async deleteAccount(
      actor: AccountActor,
      input: DeleteAccount,
    ): Promise<{ revokedCount: number }> {
      const konteks = await userRepository.findDeleteContext(actor.userId);
      // requireAuth sudah menolak akun tidak aktif; ketiadaan baris di sini
      // berarti akun dihapus di antara guard dan query ini.
      if (konteks === null) throw appError("SESI_TIDAK_VALID");

      // Skema sudah menjamin TEPAT satu terisi; ini hanya menamai yang mana.
      const metode: MetodeKonfirmasi = input.otpCode !== undefined ? "otp" : "google";
      const punyaNomor = konteks.phone !== null;
      const punyaGoogle = konteks.googleId !== null;

      const catat = (stage: "requested" | "rejected" | "completed", revokedCount?: number) => {
        auditLog(
          { actorId: actor.userId, requestId: actor.requestId },
          AUDIT_ACTION.ACCOUNT_DELETED,
          AUDIT_ENTITY,
          actor.userId,
          { stage, method: metode, ...(revokedCount === undefined ? {} : { revokedCount }) },
        );
      };

      try {
        if (input.otpCode !== undefined) {
          await buktikanLewatOtp(konteks.phone, punyaGoogle, input.otpCode, actor);
        } else if (input.google !== undefined) {
          await buktikanLewatGoogle(konteks.googleId, punyaNomor, input.google);
        }
      } catch (err) {
        // Pembuktian yang gagal adalah sinyal keamanan tersendiri: berulang atas
        // satu akun berarti seseorang memegang access token-nya tanpa memegang
        // kredensialnya. Diaudit SEBELUM error diteruskan ke pemanggil.
        catat("rejected");
        throw err;
      }

      catat("requested");

      const hasil = await userRepository.deleteAccount(actor.userId, now());
      // null = balapan; akun sudah dihapus permintaan lain lebih dulu. Bukan
      // error server: hasil yang diinginkan pengguna sudah tercapai, tetapi
      // sesinya memang tidak berlaku lagi.
      if (hasil === null) throw appError("SESI_TIDAK_VALID");

      catat("completed", hasil.revokedCount);
      beritahuPemilik(konteks.phone);
      return { revokedCount: hasil.revokedCount };
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
