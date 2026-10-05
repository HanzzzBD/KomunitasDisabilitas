import {
  NOTIFICATION_PARAM_SCHEMAS,
  NOTIFICATION_TYPE,
  type Notification,
} from "@nawasena/schemas";
import type { TujuanTautan } from "../navigation/deep-link";

/** Parameter API juga diperiksa: notificationSchema memuat record generik. */
export function tujuanNotifikasi(n: Pick<Notification, "type" | "params">): TujuanTautan | null {
  const parsed = NOTIFICATION_PARAM_SCHEMAS[n.type].safeParse(n.params);
  if (!parsed.success) return null;
  switch (n.type) {
    case NOTIFICATION_TYPE.LAMARAN_TERKIRIM:
    case NOTIFICATION_TYPE.LAMARAN_STATUS_BERUBAH:
      return "applicationId" in parsed.data && typeof parsed.data.applicationId === "string"
        ? { layar: "LamaranDetail", id: parsed.data.applicationId }
        : null;
    case NOTIFICATION_TYPE.RESUME_PDF_SIAP:
    case NOTIFICATION_TYPE.RESUME_DRAFT_AI_SIAP:
      return "resumeId" in parsed.data && typeof parsed.data.resumeId === "string"
        ? { layar: "CvEditor", id: parsed.data.resumeId }
        : null;
    case NOTIFICATION_TYPE.RESUME_DRAFT_AI_GAGAL:
      // Chat CV belum tersedia di Android; formulir manual ada di tab CV.
      return { layar: "Utama", tab: "Cv" };
    case NOTIFICATION_TYPE.AUTH_SELAMAT_DATANG:
    case NOTIFICATION_TYPE.ADMIN_LAMARAN_BARU:
    case NOTIFICATION_TYPE.ADMIN_LAMARAN_DIBATALKAN:
    case NOTIFICATION_TYPE.ADMIN_PENEMPATAN_TERKONFIRMASI:
      return null;
    default: {
      const tidakDikenal: never = n.type;
      return tidakDikenal;
    }
  }
}
