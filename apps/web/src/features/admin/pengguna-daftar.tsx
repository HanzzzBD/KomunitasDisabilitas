// Bagian "Pengguna" admin (PR-083b) — cari, saring status, tangguhkan/pulihkan.
//
// Keputusan owner 2026-10-03: daftar ber-cari (nama/nomor/email) + saring
// status di SERVER, cursor 50 + "Muat lebih banyak"; hanya PENCARI KERJA yang
// bisa ditangguhkan (baris admin tidak punya tombol aksi). Pencarian dikirim
// saat formulir dikirim (Enter / tombol Cari), bukan per ketukan: daftar yang
// berganti di tiap huruf mengumumkan dirinya terus-menerus ke screen reader.
import { useMemo, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { adminKeys, listUsersAdmin, type ApiClient } from "@nawasena/api-client";
import type { AdminUser, AdminUserStatus } from "@nawasena/schemas";
import {
  KolomForm,
  Masukan,
  Pilihan,
  Tabel,
  Tombol,
  WilayahMemuat,
  type KolomTabel,
} from "@nawasena/ui";
import { pesanGalatApi } from "../../shared/galat-api.js";
import { useTeks } from "../../shared/i18n/index.js";
import { TANGGAL_LAMARAN } from "./lamaran-daftar.js";
import { DialogModerasi } from "./pengguna-moderasi.js";

const SEMUA = "semua";
const PER_HALAMAN = 50;

export function DaftarPengguna({ klien }: { klien: ApiClient }) {
  const t = useTeks();
  const queryClient = useQueryClient();
  const [ketikan, setKetikan] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>(SEMUA);
  const [kabar, setKabar] = useState("");

  const filter = {
    q: q.trim() === "" ? undefined : q.trim(),
    status: status === SEMUA ? undefined : (status as AdminUserStatus),
  };

  const daftar = useInfiniteQuery({
    queryKey: adminKeys.users(filter),
    queryFn: ({ pageParam }) =>
      listUsersAdmin(klien, { ...filter, cursor: pageParam, limit: PER_HALAMAN }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (h) => h.meta.nextCursor ?? undefined,
  });
  const data = useMemo(() => daftar.data?.pages.flatMap((h) => h.data) ?? [], [daftar.data]);

  function cari(e: FormEvent): void {
    e.preventDefault();
    setQ(ketikan);
  }

  function selesai(hasil: AdminUser): void {
    const nama = hasil.fullName.trim() === "" ? t("admin.pengguna.tanpaNama") : hasil.fullName;
    setKabar(
      t(
        hasil.suspendedAt === null
          ? "admin.pengguna.kabar.dipulihkan"
          : "admin.pengguna.kabar.ditangguhkan",
        { nama },
      ),
    );
    // Seluruh daftar pengguna (semua saringan) + daftar lamaran admin, yang
    // menyembunyikan akun ditangguhkan, ikut basi.
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
  }

  const kolom: ReadonlyArray<KolomTabel<AdminUser>> = [
    {
      kunci: "fullName",
      label: t("admin.pengguna.kolom.nama"),
      render: (u) => (u.fullName.trim() === "" ? t("admin.pengguna.tanpaNama") : u.fullName),
    },
    {
      kunci: "phone",
      label: t("admin.pengguna.kolom.kontak"),
      render: (u) =>
        [u.phone, u.email].filter((v): v is string => v !== null).join(" · ") ||
        t("admin.pengguna.tanpaKontak"),
    },
    {
      kunci: "role",
      label: t("admin.pengguna.kolom.peran"),
      render: (u) =>
        t(u.role === "admin" ? "admin.pengguna.peran.admin" : "admin.pengguna.peran.seeker"),
    },
    {
      kunci: "suspendedAt",
      label: t("admin.pengguna.kolom.status"),
      render: (u) =>
        u.suspendedAt === null ? (
          t("admin.pengguna.status.aktif")
        ) : (
          <span className="flex flex-col">
            <span className="font-semibold">
              {t("admin.pengguna.status.ditangguhkanSejak", {
                tanggal: TANGGAL_LAMARAN.format(new Date(u.suspendedAt)),
              })}
            </span>
            {u.suspendReason !== null && (
              <span className="text-gray-700">
                {t("admin.pengguna.alasanTercatat", { alasan: u.suspendReason })}
              </span>
            )}
          </span>
        ),
    },
    {
      kunci: "id",
      label: t("admin.pengguna.kolom.aksi"),
      render: (u) => {
        if (u.role !== "seeker") return t("admin.pengguna.tanpaAksi");
        const nama = u.fullName.trim() === "" ? t("admin.pengguna.tanpaNama") : u.fullName;
        const tangguhkan = u.suspendedAt === null;
        return (
          <DialogModerasi
            klien={klien}
            pengguna={u}
            aksi={tangguhkan ? "tangguhkan" : "pulihkan"}
            onSelesai={selesai}
            pemicu={
              <Tombol varian="sekunder" ukuran="kecil">
                {t(
                  tangguhkan
                    ? "admin.pengguna.tangguhkan.tombol"
                    : "admin.pengguna.pulihkan.tombol",
                  { nama },
                )}
              </Tombol>
            }
          />
        );
      },
    },
  ];

  return (
    <section aria-labelledby="admin-pengguna-judul" className="flex flex-col gap-4">
      <h2 id="admin-pengguna-judul" className="text-2xl font-semibold text-gray-900">
        {t("admin.pengguna.judul")}
      </h2>
      <p className="text-base text-gray-900">{t("admin.pengguna.penjelasan")}</p>

      <form role="search" onSubmit={cari} className="flex flex-wrap items-end gap-4">
        <KolomForm
          label={t("admin.pengguna.cari.label")}
          bantuan={t("admin.pengguna.cari.bantuan")}
          className="min-w-64"
        >
          <Masukan
            type="search"
            value={ketikan}
            onChange={(e) => {
              setKetikan(e.target.value);
            }}
          />
        </KolomForm>
        <Tombol type="submit">{t("admin.pengguna.cari.tombol")}</Tombol>
        <KolomForm label={t("admin.pengguna.filterStatus.label")} className="min-w-56">
          <Pilihan
            opsi={[
              { nilai: SEMUA, label: t("admin.pengguna.filterStatus.semua") },
              { nilai: "aktif", label: t("admin.pengguna.status.aktif") },
              { nilai: "ditangguhkan", label: t("admin.pengguna.status.ditangguhkan") },
            ]}
            nilai={status}
            onUbah={setStatus}
          />
        </KolomForm>
      </form>

      <p role="status" className="text-base font-medium text-gray-900">
        {kabar}
      </p>

      {daftar.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-base font-medium text-red-700">{t("admin.pengguna.gagalMuat")}</p>
          <p className="text-base text-gray-900">
            {pesanGalatApi(daftar.error, t, { JARINGAN_GAGAL: "shell.galat.jaringan" })}
          </p>
          <Tombol
            varian="sekunder"
            onClick={() => {
              void daftar.refetch();
            }}
          >
            {t("admin.pengguna.cobaLagi")}
          </Tombol>
        </div>
      ) : (
        <WilayahMemuat memuat={daftar.isPending} label={t("admin.pengguna.memuat")}>
          <Tabel
            kolom={kolom}
            data={data}
            kunciBaris={(u) => u.id}
            judul={t("admin.pengguna.tabelJudul")}
            kosong={<p className="text-base text-gray-900">{t("admin.pengguna.kosong")}</p>}
          />
        </WilayahMemuat>
      )}

      {daftar.hasNextPage && (
        <Tombol
          varian="sekunder"
          className="self-start"
          aria-disabled={daftar.isFetchingNextPage}
          aria-busy={daftar.isFetchingNextPage}
          onClick={() => {
            if (!daftar.isFetchingNextPage) void daftar.fetchNextPage();
          }}
        >
          {daftar.isFetchingNextPage
            ? t("admin.pengguna.memuatLagi")
            : t("admin.pengguna.muatLagi")}
        </Tombol>
      )}
    </section>
  );
}
