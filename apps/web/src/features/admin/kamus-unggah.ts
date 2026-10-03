// Unggah berkas kamus BISINDO langsung ke bucket (PR-085b).
//
// XMLHttpRequest, BUKAN fetch: hanya XHR yang melaporkan progres UNGGAH
// (`xhr.upload.onprogress`), dan AC PR-085 meminta persen diumumkan. Header
// dari izin dikirim APA ADANYA — content-type dan content-length ikut
// ditandatangani server (PR-085a); browser mengisi content-length sendiri dari
// ukuran Blob, jadi berkas yang berbeda dari yang dideklarasikan ditolak 403.
import {
  SIGN_VIDEO_MEDIA,
  type SignVideoMediaKind,
  type SignVideoPresignResult,
} from "@nawasena/schemas";
import type { KunciTeks } from "../../shared/i18n/index.js";

/** Sebab gagal yang dibedakan pesan untuk admin. */
export type JenisGagalUnggah = "jaringan" | "ditolak" | "dibatalkan";

export class UnggahGagal extends Error {
  constructor(
    readonly jenis: JenisGagalUnggah,
    readonly status?: number,
  ) {
    super(`Unggah gagal: ${jenis}${status === undefined ? "" : ` (${status})`}`);
    this.name = "UnggahGagal";
  }
}

/** Bagian XHR yang dipakai — injeksi untuk test (jsdom tidak mengunggah apa pun). */
export interface XhrMinimal {
  open(method: string, url: string): void;
  setRequestHeader(nama: string, nilai: string): void;
  send(badan: Blob): void;
  abort(): void;
  status: number;
  upload: {
    onprogress: ((e: { loaded: number; total: number; lengthComputable: boolean }) => void) | null;
  };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
}

export interface OpsiUnggah {
  /** 0–100, bilangan bulat; dipanggil hanya bila nilainya berubah. */
  onProgres: (persen: number) => void;
  signal?: AbortSignal;
  buatXhr?: () => XhrMinimal;
}

export function unggahKeStorage(
  izin: Pick<SignVideoPresignResult, "uploadUrl" | "method" | "headers">,
  berkas: Blob,
  opsi: OpsiUnggah,
): Promise<void> {
  return new Promise((selesai, gagal) => {
    if (opsi.signal?.aborted === true) {
      gagal(new UnggahGagal("dibatalkan"));
      return;
    }
    const xhr = opsi.buatXhr?.() ?? (new XMLHttpRequest() as unknown as XhrMinimal);
    let terakhir = -1;

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || e.total === 0) return;
      const persen = Math.min(100, Math.floor((e.loaded / e.total) * 100));
      if (persen !== terakhir) {
        terakhir = persen;
        opsi.onProgres(persen);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (terakhir !== 100) opsi.onProgres(100);
        selesai();
      } else {
        gagal(new UnggahGagal("ditolak", xhr.status));
      }
    };
    xhr.onerror = () => gagal(new UnggahGagal("jaringan"));
    xhr.onabort = () => gagal(new UnggahGagal("dibatalkan"));
    opsi.signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.open(izin.method, izin.uploadUrl);
    for (const [nama, nilai] of Object.entries(izin.headers)) xhr.setRequestHeader(nama, nilai);
    xhr.send(berkas);
  });
}

/**
 * Tipe MIME berkas. Windows sering memberi `File.type` KOSONG untuk `.vtt`
 * (tidak terdaftar di registry), jadi ekstensi dipakai sebagai cadangan —
 * tanpa ini caption yang sah ditolak sebelum sempat diunggah.
 */
export function tipeBerkas(kind: SignVideoMediaKind, berkas: Pick<File, "name" | "type">): string {
  if (berkas.type !== "") return berkas.type;
  const ext = berkas.name.toLowerCase().split(".").pop() ?? "";
  const cocok = Object.entries(SIGN_VIDEO_MEDIA[kind].tipe).find(
    ([, e]) => e === ext || (ext === "jpeg" && e === "jpg"),
  );
  return cocok?.[0] ?? "";
}

/** Validasi dini di browser — server tetap menolak lagi (zod + stat). `null` = sah. */
export function periksaBerkas(
  kind: SignVideoMediaKind,
  berkas: Pick<File, "name" | "type" | "size">,
): KunciTeks | null {
  if (berkas.size === 0) return "admin.kamus.unggah.galat.kosong";
  if (!(tipeBerkas(kind, berkas) in SIGN_VIDEO_MEDIA[kind].tipe)) {
    return `admin.kamus.unggah.galat.tipe.${kind}`;
  }
  if (berkas.size > SIGN_VIDEO_MEDIA[kind].maksByte) {
    return `admin.kamus.unggah.galat.ukuran.${kind}`;
  }
  return null;
}

/** `accept` untuk `<input type="file">` — MIME + ekstensi (cadangan `.vtt`, lihat `tipeBerkas`). */
export function acceptUntuk(kind: SignVideoMediaKind): string {
  const aturan = SIGN_VIDEO_MEDIA[kind].tipe;
  return [...Object.keys(aturan), ...Object.values(aturan).map((e) => `.${e}`)].join(",");
}

/**
 * Persen yang DIUMUMKAN screen reader — kelipatan 25 saja. Mengumumkan setiap
 * persen akan menenggelamkan apa pun yang sedang dibacakan; `<progress>` tetap
 * memegang angka persisnya untuk yang ingin memeriksa.
 */
export function persenDiumumkan(persen: number): number {
  return Math.floor(persen / 25) * 25;
}
