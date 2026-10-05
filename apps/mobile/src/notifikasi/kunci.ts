import { notificationsKeys } from "@nawasena/api-client";

export const kunciTerbaru = (sub: string | null) =>
  ["notifications-terbaru", { sub: sub ?? "anonim" }] as const;
export const kunciBaca = (sub: string | null) =>
  ["notifications-baca", { sub: sub ?? "anonim" }] as const;
export const kunciDaftar = (sub: string) => [
  notificationsKeys.daftar(sub, false),
  notificationsKeys.daftar(sub, true),
];
