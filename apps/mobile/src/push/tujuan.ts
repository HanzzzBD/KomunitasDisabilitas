import { idSchema, NOTIFICATION_PARAM_SCHEMAS } from "@nawasena/schemas";

import type { TujuanTautan } from "../navigation/deep-link";

/** Payload FCM PR-048: URL arbitrary pada data tidak pernah dipakai. */
export function tujuanPush(data: unknown): TujuanTautan | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const { notificationId, type, ...params } = data as Record<string, unknown>;
  if (!idSchema.safeParse(notificationId).success) return null;
  if (type !== "lamaran.terkirim" && type !== "lamaran.status_berubah") return null;
  const parsed = NOTIFICATION_PARAM_SCHEMAS[type].safeParse(params);
  if (!parsed.success) return null;
  return { layar: "LamaranDetail", id: parsed.data.applicationId };
}
