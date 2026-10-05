// Tab Cari — browse + filter lowongan (PR-093; paritas PR-058/059 web).
//
// FILTER DITERAPKAN HANYA SAAT "Cari" (WCAG 3.2.2): `rancangan` (isian form)
// terpisah dari `filter` (yang dipakai query). Hasil yang berubah sendiri saat
// pengguna TalkBack masih menjelajahi kotak centang adalah perubahan konteks
// tak terduga.
//
// Panel filter bisa ditutup supaya hasil tidak terdorong jauh ke bawah di layar
// kecil; tombolnya menyebut keadaan (diperluas/diciutkan) dan jumlah filter aktif.
// Jumlah hasil HALAMAN PERTAMA diumumkan setiap kali filter berubah — bukan saat
// "Muat lebih banyak" (server tidak mengirim total).
import { jobsKeys, searchJobs } from "@nawasena/api-client";
import {
  FILTER_KOSONG,
  jumlahFilterAktif,
  keOpsiPencarian,
  MODE_KERJA_SEMUA,
  type NilaiFilterLowongan,
} from "@nawasena/lowongan";
import { alihkan } from "@nawasena/formulir";
import { ACCOMMODATION_NEEDS, type JobSearchResponse } from "@nawasena/schemas";
import { KotakCentang, Masukan, PilihanTunggal, Tombol, useTokenA11y } from "@nawasena/ui-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { apiClient } from "../../api";
import { GagalMuat } from "../../komponen/GagalMuat";
import { Judul, Memuat, Paragraf, PesanStatus } from "../../komponen/Layar";
import { KartuLowongan } from "../../lowongan/KartuLowongan";
import type { RootStackParamList } from "../../navigation/types";
import { LABEL_AKOMODASI } from "../../profil/label";

const PER_HALAMAN = 20;

const OPSI_MODE = [
  { nilai: MODE_KERJA_SEMUA, label: "Semua" },
  { nilai: "onsite", label: "Kerja di kantor" },
  { nilai: "hybrid", label: "Kadang di kantor, kadang di rumah" },
  { nilai: "remote", label: "Kerja dari rumah" },
] as const;

export function CariScreen() {
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const { warna, targetSentuh } = useTokenA11y();
  const [rancangan, setRancangan] = useState<NilaiFilterLowongan>(FILTER_KOSONG);
  const [filter, setFilter] = useState<NilaiFilterLowongan>(FILTER_KOSONG);
  const [panelTerbuka, setPanelTerbuka] = useState(false);
  const [pengumuman, setPengumuman] = useState<string>();
  const opsi = useMemo(() => keOpsiPencarian(filter), [filter]);

  const daftar = useInfiniteQuery({
    queryKey: jobsKeys.search(opsi),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      searchJobs(apiClient, {
        ...opsi,
        limit: PER_HALAMAN,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (terakhir: JobSearchResponse) => terakhir.meta.nextCursor ?? undefined,
  });

  // Umumkan jumlah halaman pertama setiap filter berubah dan selesai dimuat.
  const jumlahPertama = daftar.data?.pages[0]?.data.length;
  useEffect(() => {
    if (jumlahPertama === undefined) return;
    setPengumuman(
      jumlahPertama === 0
        ? "Tidak ada lowongan yang cocok dengan pencarian ini."
        : `${String(jumlahPertama)}${daftar.hasNextPage ? " lebih" : ""} lowongan ditemukan.`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya saat filter/halaman pertama berubah
  }, [opsi, jumlahPertama]);

  const item = daftar.data?.pages.flatMap((h) => h.data) ?? [];
  const aktif = jumlahFilterAktif(filter);

  const kepala = (
    <View style={{ gap: 16, paddingBottom: 8 }}>
      <Judul>Cari lowongan</Judul>
      <Masukan
        testID="masukan-kata-kunci"
        label="Kata kunci"
        petunjuk="Contoh: admin, desain, penulis."
        nilai={rancangan.query}
        ubahNilai={(query) => setRancangan({ ...rancangan, query })}
        maxLength={100}
      />
      <Pressable
        testID="tombol-panel-filter"
        accessibilityRole="button"
        accessibilityLabel={`Filter lainnya${aktif > 0 ? `, ${String(aktif)} aktif` : ""}`}
        accessibilityState={{ expanded: panelTerbuka }}
        onPress={() => setPanelTerbuka((v) => !v)}
        style={{ minHeight: targetSentuh, justifyContent: "center" }}
      >
        <Text
          importantForAccessibility="no"
          style={{ color: warna.teks, fontWeight: "700", fontSize: 16 }}
        >
          {panelTerbuka ? "▾" : "▸"} Filter lainnya{aktif > 0 ? ` (${String(aktif)} aktif)` : ""}
        </Text>
      </Pressable>
      {panelTerbuka ? (
        <View style={{ gap: 12 }}>
          <Masukan
            label="Kota"
            nilai={rancangan.city}
            ubahNilai={(city) => setRancangan({ ...rancangan, city })}
            maxLength={80}
          />
          <Masukan
            label="Provinsi"
            nilai={rancangan.province}
            ubahNilai={(province) => setRancangan({ ...rancangan, province })}
            maxLength={80}
          />
          <PilihanTunggal
            testID="pilihan-mode"
            judul="Cara kerja"
            opsi={OPSI_MODE}
            nilai={rancangan.workMode}
            onUbah={(workMode) => setRancangan({ ...rancangan, workMode })}
          />
          <Judul tingkat={2}>Harus menyediakan</Judul>
          {ACCOMMODATION_NEEDS.map((a) => (
            <KotakCentang
              key={a}
              testID={`filter-akomodasi-${a}`}
              label={LABEL_AKOMODASI[a]}
              dicentang={rancangan.accommodations.includes(a)}
              onUbah={(d) =>
                setRancangan({
                  ...rancangan,
                  accommodations: alihkan(rancangan.accommodations, a, d),
                })
              }
            />
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Tombol testID="tombol-cari" label="Cari" onPress={() => setFilter(rancangan)} />
        <Tombol
          label="Hapus filter"
          varian="sekunder"
          onPress={() => {
            setRancangan(FILTER_KOSONG);
            setFilter(FILTER_KOSONG);
          }}
        />
      </View>
      <PesanStatus testID="pengumuman-hasil" pesan={pengumuman} />
      {daftar.isError ? (
        <GagalMuat galat={daftar.error} ulang={() => void daftar.refetch()} />
      ) : null}
      {daftar.isPending ? <Memuat label="Mencari lowongan" /> : null}
      {daftar.isSuccess && item.length === 0 ? (
        <Paragraf>Coba kata kunci lain, atau kurangi filter.</Paragraf>
      ) : null}
    </View>
  );

  return (
    <FlatList
      testID="layar-cari"
      style={{ backgroundColor: warna.latar }}
      contentContainerStyle={{ padding: 24, gap: 12 }}
      keyboardShouldPersistTaps="handled"
      data={item}
      keyExtractor={(j) => j.id}
      ListHeaderComponent={kepala}
      renderItem={({ item: j }) => (
        <KartuLowongan job={j} onBuka={() => nav.navigate("LowonganDetail", { id: j.id })} />
      )}
      ListFooterComponent={
        daftar.hasNextPage ? (
          <Tombol
            label="Muat lebih banyak lowongan"
            varian="sekunder"
            sibuk={daftar.isFetchingNextPage}
            onPress={() => void daftar.fetchNextPage()}
          />
        ) : null
      }
    />
  );
}
