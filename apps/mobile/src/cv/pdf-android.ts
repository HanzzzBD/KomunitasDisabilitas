// Implementasi Android `PlatformPdf` (PR-092). Satu-satunya pengimpor
// expo-file-system / expo-intent-launcher / expo-sharing.
import { Directory, File, Paths } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy";
import { startActivityAsync } from "expo-intent-launcher";
import { shareAsync } from "expo-sharing";

import type { PlatformPdf } from "./pdf";

/** Intent.FLAG_GRANT_READ_URI_PERMISSION — viewer boleh membaca content:// kita. */
const IZIN_BACA_URI = 1;

const MIME_PDF = "application/pdf";

/** Folder khusus PDF CV di cache app — mudah dibuang utuh saat keluar. */
const folderCv = () => new Directory(Paths.cache, "cv");

export const pdfAndroid: PlatformPdf = {
  async unduh(url, namaBerkas) {
    const folder = folderCv();
    if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
    const berkas = await File.downloadFileAsync(url, new File(folder, namaBerkas), {
      idempotent: true,
    });
    return berkas.uri;
  },
  keContentUri: (uri) => getContentUriAsync(uri),
  async bukaViewer(contentUri) {
    await startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      type: MIME_PDF,
      flags: IZIN_BACA_URI,
    });
  },
  bagikan: (uri) => shareAsync(uri, { mimeType: MIME_PDF, dialogTitle: "Simpan atau bagikan CV" }),
};

/** Buang semua PDF CV dari cache — dipanggil saat keluar (perangkat bersama). */
export function hapusPdfCv(): void {
  const folder = folderCv();
  if (folder.exists) folder.delete();
}
