// modules/auth — kontrak pengirim OTP.
//
// Service TIDAK boleh tahu nama provider: ia hanya memanggil OtpSender.send().
// Adapter nyata (Fonnte primer + fallback Twilio SMS) menyusul di PR-016b —
// risiko "ketergantungan Fonnte" dijawab oleh interface ini, bukan oleh kode
// service yang menyebut provider.

export interface OtpMessage {
  /** Nomor tujuan E.164. PII — jangan pernah masuk log/audit. */
  phone: string;
  /** Kode 6 angka. Rahasia — jangan pernah masuk log/audit. */
  code: string;
}

export interface OtpSender {
  /** Nama untuk log/metrik (bukan rahasia): "fonnte", "twilio", … */
  readonly name: string;
  send(message: OtpMessage): Promise<void>;
}

/** Gagal kirim di sisi provider — pemanggil memutuskan fallback/menyerah. */
export class OtpSenderError extends Error {
  readonly provider: string;

  constructor(provider: string, message: string) {
    super(message);
    this.name = "OtpSenderError";
    this.provider = provider;
  }
}

/**
 * Pengirim "belum dikonfigurasi": selalu gagal, sehingga endpoint menjawab 503
 * dan kode yang telanjur dibuat dihanguskan. Deny-by-default — API tetap bisa
 * di-boot tanpa kredensial provider (pola INTERNAL_TOKEN, PR-015b).
 * Diganti adapter Fonnte/Twilio di PR-016b.
 */
export function createUnavailableOtpSender(): OtpSender {
  return {
    name: "belum-dikonfigurasi",
    send() {
      return Promise.reject(
        new OtpSenderError("belum-dikonfigurasi", "Provider pengirim OTP belum dikonfigurasi"),
      );
    },
  };
}
