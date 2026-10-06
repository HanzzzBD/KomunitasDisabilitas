// Implementasi Android `PlatformPdf` (PR-092). Satu-satunya pengimpor
// expo-file-system / expo-intent-launcher / expo-sharing.
import { Directory, File, Paths } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy";
import { startActivityAsync } from "expo-intent-launcher";
import { shareAsync } from "expo-sharing";
import { downloadResumePdf } from "@nawasena/api-client";
import { apiClient } from "../api";

import type { PlatformPdf } from "./pdf";

/** Intent.FLAG_GRANT_READ_URI_PERMISSION — viewer boleh membaca content:// kita. */
const IZIN_BACA_URI = 1;

const MIME_PDF = "application/pdf";

/** Folder khusus PDF CV di cache app — mudah dibuang utuh saat keluar. */
const folderCv = () => new Directory(Paths.cache, "cv");

export const pdfAndroid: PlatformPdf = {
  async unduh(_url, namaBerkas, resumeId) {
    const folder = folderCv();
    if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
    const bytes = await downloadResumePdf(apiClient, resumeId);
    const berkas = new File(folder, namaBerkas);
    berkas.write(bytes);
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
