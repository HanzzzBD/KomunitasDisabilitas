import { expect, it, vi } from "vitest";
import { usersKeys, type ApiClient } from "@nawasena/api-client";
import { createQueryClient } from "../src/app/query-client.js";
import { tujuanSetelahMasuk } from "../src/features/auth/tujuan-setelah-masuk.js";

it("role admin yang ter-cache dari akun lama tidak mengarahkan seeker baru ke dashboard", async () => {
  const queryClient = createQueryClient();
  queryClient.setQueryData(usersKeys.me(), { data: { id: "akun-lama", role: "admin" } });
  const profilBaru = { data: { id: "akun-baru", role: "seeker" } };
  const request = vi.fn().mockResolvedValue(profilBaru);
  const klien = { request } as ApiClient;

  expect(await tujuanSetelahMasuk(klien, queryClient, "/lamaran")).toBe("/lamaran");
  expect(request).toHaveBeenCalledWith("/me", expect.anything());
  expect(queryClient.getQueryData(usersKeys.me())).toEqual(profilBaru);
});
it("employer lands in its company workspace after login", async () => {
  const qc = createQueryClient();
  const client = {
    request: vi.fn().mockResolvedValue({ data: { role: "employer" } }),
  } as unknown as ApiClient;
  expect(await tujuanSetelahMasuk(client, qc, "/")).toBe("/employer");
});

it("pembacaan profil gagal menghapus cache role lama dan menolak tujuan ke luar situs", async () => {
  const queryClient = createQueryClient();
  queryClient.setQueryData(usersKeys.me(), { data: { role: "admin" } });
  const klien = { request: vi.fn().mockRejectedValue(new Error("jaringan")) } as ApiClient;

  expect(await tujuanSetelahMasuk(klien, queryClient, "https://jahat.example")).toBe("/");
  expect(queryClient.getQueryData(usersKeys.me())).toBeUndefined();
});
