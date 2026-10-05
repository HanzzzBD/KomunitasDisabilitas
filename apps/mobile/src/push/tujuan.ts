import { idSchema, notificationTypeSchema, NOTIFICATION_PARAM_SCHEMAS } from "@nawasena/schemas";

import type { TujuanTautan } from "../navigation/deep-link";
import { tujuanNotifikasi } from "../notifikasi/tujuan";

export function dataPush(data: unknown) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const { notificationId, type, ...params } = data as Record<string, unknown>;
  const id = idSchema.safeParse(notificationId);
  const jenis = notificationTypeSchema.safeParse(type);
  if (!id.success || !jenis.success || jenis.data.startsWith("admin.")) return null;
  const parsed = NOTIFICATION_PARAM_SCHEMAS[jenis.data].safeParse(params);
  return parsed.success ? { id: id.data, type: jenis.data, params: parsed.data } : null;
}

/** Payload FCM PR-048: URL arbitrary pada data tidak pernah dipakai. */
export function tujuanPush(data: unknown): TujuanTautan | null {
  const n = dataPush(data);
  return n ? (tujuanNotifikasi(n) ?? { layar: "Notifikasi" }) : null;
}
