import { getMe, usersKeys, type ApiClient } from "@nawasena/api-client";
import type { QueryClient } from "@tanstack/react-query";
import { bersihkanTujuan } from "../../shared/rute/tujuan.js";

/** Admin selalu ke dashboard; akun lain kembali ke tujuan internal awal. */
export async function tujuanSetelahMasuk(
  klien: ApiClient,
  queryClient: QueryClient,
  tujuan: string,
): Promise<string> {
  const bersih = bersihkanTujuan(tujuan);

  // `/me` tidak memakai userId pada key. Akun yang berganti harus membaca
  // profil baru, termasuk ketika cache akun sebelumnya masih dianggap segar.
  await queryClient.cancelQueries({ queryKey: usersKeys.me() });
  queryClient.removeQueries({ queryKey: usersKeys.me() });
  try {
    const profil = await getMe(klien);
    queryClient.setQueryData(usersKeys.me(), profil);
    return profil.data.role === "admin" ? "/admin" : bersih;
  } catch {
    // Login sudah berhasil. Gangguan pembacaan profil tidak boleh tampil
    // sebagai OTP/code Google yang salah, atau menyuruh menukar code lagi.
    return bersih;
  }
}
