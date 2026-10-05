import { ApiError } from "@nawasena/api-client";
import type { Notification } from "@nawasena/schemas";
export const WAKTU_NOTIFIKASI = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});
export function labelItem(n: Notification, bahasa: "id" | "id-simple") {
  return `${n.title[bahasa]}. ${n.body[bahasa]} ${WAKTU_NOTIFIKASI.format(new Date(n.createdAt))} WIB. ${n.readAt ? "Sudah dibaca." : "Belum dibaca."}`;
}
export function galatNotifikasi(e: unknown) {
  if (e instanceof ApiError && e.code === "NOTIFIKASI_TIDAK_DITEMUKAN")
    return "Notifikasi tidak ditemukan. Muat ulang daftar.";
  return "Notifikasi belum bisa diperbarui. Periksa koneksi lalu coba lagi.";
}
