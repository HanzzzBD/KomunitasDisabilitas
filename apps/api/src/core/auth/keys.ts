// core/auth — pemuatan & validasi pasangan kunci sesi RS256 (PR-018, ADR-015).
//
// Pola sengaja MENIRU core/crypto (PR-013): core/config hanya memastikan kedua
// variabel ada bersama-sama; BENTUK kuncinya divalidasi di sini, dan hasilnya
// dilempar sebagai error boot — bukan saat login pertama gagal ditandatangani.
//
// Modul ini TIDAK menyentuh Prisma dan TIDAK menyentuh logger:
// - tanpa Prisma supaya boleh di-import STATIS dari index.ts (import Prisma
//   memuat .env sebagai efek samping dan akan melangkahi gerbang — lihat
//   catatan di index.ts dan crypto-boot.test.ts);
// - tanpa logger supaya material kunci privat tidak punya jalan menuju log.
//
// Kunci disimpan base64 dari PEM: PEM asli multi-baris tidak bisa ditulis apa
// adanya di .env/compose tanpa lolos-kutip yang rapuh.
import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";

/** RSA di bawah ini dianggap tidak layak tanda tangan (NIST SP 800-57). */
const MIN_MODULUS_BITS = 2048;

/** Kunci sesi salah bentuk — dilempar saat BOOT (pola FieldKeyError). */
export class SessionKeyError extends Error {
  readonly issues: ReadonlyArray<readonly [variable: string, reason: string]>;

  constructor(issues: ReadonlyArray<readonly [string, string]>) {
    const daftar = issues.map(([nama, alasan]) => `  - ${nama}: ${alasan}`).join("\n");
    super(
      `Kunci sesi JWT tidak valid:\n${daftar}\n` +
        "Buat pasangan baru:\n" +
        "  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt.key\n" +
        "  openssl rsa -in jwt.key -pubout -out jwt.pub\n" +
        "  JWT_PRIVATE_KEY=$(base64 -w0 jwt.key)  JWT_PUBLIC_KEY=$(base64 -w0 jwt.pub)",
    );
    this.name = "SessionKeyError";
    this.issues = issues;
  }
}

export interface SessionKeys {
  /** Menandatangani access token. JANGAN pernah keluar dari proses ini. */
  privateKey: KeyObject;
  /** Memverifikasi access token; boleh dibagikan (fondasi JWKS kelak). */
  publicKey: KeyObject;
}

/** base64 → PEM; mengembalikan null bila bukan base64 yang bulat. */
function decodePem(raw: string): string | null {
  const trimmed = raw.trim();
  const pem = Buffer.from(trimmed, "base64").toString("utf8");
  // Round-trip guard: base64 rusak tetap "berhasil" di-decode Node menjadi
  // sampah. Bandingkan balik supaya salin-tempel yang terpotong ketahuan.
  if (Buffer.from(pem, "utf8").toString("base64") !== trimmed) return null;
  return pem;
}

/**
 * Rakit pasangan kunci dari env.
 *
 * - kedua variabel kosong → `undefined` (fitur sesi mati; pemanggil menutup
 *   endpoint dengan 503, bukan berjalan tanpa sesi yang bisa diverifikasi);
 * - salah satu kosong → sudah dicegat core/config (grup kredensial);
 * - terisi tetapi salah bentuk/terlalu pendek/bukan pasangan → SessionKeyError.
 */
export function parseSessionKeys(source: NodeJS.ProcessEnv = process.env): SessionKeys | undefined {
  const privateRaw = source.JWT_PRIVATE_KEY;
  const publicRaw = source.JWT_PUBLIC_KEY;
  if (privateRaw === undefined && publicRaw === undefined) return undefined;

  const issues: Array<readonly [string, string]> = [];
  if (privateRaw === undefined) issues.push(["JWT_PRIVATE_KEY", "wajib diisi bila JWT_PUBLIC_KEY di-set"]);
  if (publicRaw === undefined) issues.push(["JWT_PUBLIC_KEY", "wajib diisi bila JWT_PRIVATE_KEY di-set"]);
  if (issues.length > 0) throw new SessionKeyError(issues);

  const privatePem = decodePem(privateRaw as string);
  const publicPem = decodePem(publicRaw as string);
  if (privatePem === null) issues.push(["JWT_PRIVATE_KEY", "harus base64 valid dari PEM kunci privat"]);
  if (publicPem === null) issues.push(["JWT_PUBLIC_KEY", "harus base64 valid dari PEM kunci publik"]);
  if (issues.length > 0) throw new SessionKeyError(issues);

  let privateKey: KeyObject;
  let publicKey: KeyObject;
  try {
    privateKey = createPrivateKey(privatePem as string);
  } catch {
    // Pesan TIDAK memuat isi kunci.
    throw new SessionKeyError([["JWT_PRIVATE_KEY", "bukan PEM kunci privat yang bisa dibaca"]]);
  }
  try {
    publicKey = createPublicKey(publicPem as string);
  } catch {
    throw new SessionKeyError([["JWT_PUBLIC_KEY", "bukan PEM kunci publik yang bisa dibaca"]]);
  }

  if (privateKey.asymmetricKeyType !== "rsa") {
    issues.push(["JWT_PRIVATE_KEY", "harus kunci RSA (RS256) — kunci EC/Ed25519 tidak dipakai di sini"]);
  }
  if (publicKey.asymmetricKeyType !== "rsa") {
    issues.push(["JWT_PUBLIC_KEY", "harus kunci RSA (RS256) — kunci EC/Ed25519 tidak dipakai di sini"]);
  }
  const bits = privateKey.asymmetricKeyDetails?.modulusLength ?? 0;
  if (privateKey.asymmetricKeyType === "rsa" && bits < MIN_MODULUS_BITS) {
    issues.push(["JWT_PRIVATE_KEY", `modulus ${bits} bit terlalu pendek, minimal ${MIN_MODULUS_BITS} bit`]);
  }
  if (issues.length > 0) throw new SessionKeyError(issues);

  // Pasangan yang tidak cocok = seluruh access token terbit lalu ditolak sendiri
  // saat diverifikasi. Lebih baik mati saat boot daripada saat pengguna masuk.
  if (
    privateKey.asymmetricKeyType === "rsa" &&
    publicKey.asymmetricKeyType === "rsa" &&
    createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString() !==
      publicKey.export({ type: "spki", format: "pem" }).toString()
  ) {
    throw new SessionKeyError([
      ["JWT_PUBLIC_KEY", "bukan pasangan dari JWT_PRIVATE_KEY (token akan ditolak verifikasinya sendiri)"],
    ]);
  }

  return { privateKey, publicKey };
}
