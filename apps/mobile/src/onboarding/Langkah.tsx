// Empat langkah wizard onboarding mobile (PR-091) — paritas PR-035.
//
// Teks ditulis SEKALI dalam bahasa sederhana (setara varian `id-simple` web):
// mobile belum punya katalog i18n (keputusan owner; utang U-37). Preferensi
// `simpleLanguage` tetap tersimpan dan tersinkron. Sejak PR-095 notifikasi
// memilih varian server; teks wizard sendiri selalu sederhana.
//
// Ragam disabilitas + izin HANYA di memori (state layar), tidak pernah ke
// penyimpanan atau jaringan — paritas web (keputusan owner 2026-10-05).
import { rekonsiliasi, type AccessibilityPreferences } from "@nawasena/a11y";
import { KotakCentang, Tombol, UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import { useMemo } from "react";
import { Text, View } from "react-native";

import { a11yStore } from "../a11y/store";
import { geserSkala, SKALA_TEKS } from "./mesin-langkah";

export const RAGAM: readonly { nilai: string; label: string }[] = [
  { nilai: "tuli", label: "Tuli atau susah dengar" },
  { nilai: "netra", label: "Buta atau susah lihat" },
  { nilai: "daksa", label: "Susah bergerak atau memakai tangan" },
  { nilai: "autisme", label: "Autisme" },
  { nilai: "lainnya", label: "Lainnya" },
];

type KunciSaklar = Exclude<keyof AccessibilityPreferences, "textScale">;

export const SAKLAR: readonly { kunci: KunciSaklar; label: string; bantuan: string }[] = [
  {
    kunci: "highContrast",
    label: "Warna lebih tegas",
    bantuan: "Huruf jadi lebih jelas dari warna belakangnya.",
  },
  {
    kunci: "reduceMotion",
    label: "Kurangi gerakan",
    bantuan: "Gambar dan tombol berhenti bergerak. Ini membantu kalau gerakan membuat Anda pusing.",
  },
  {
    kunci: "simpleLanguage",
    label: "Teks sederhana",
    bantuan: "Kalimat jadi pendek. Katanya sehari-hari.",
  },
  {
    kunci: "largeTouchTargets",
    label: "Tombol lebih besar",
    bantuan: "Tombol jadi lebih besar. Jari lebih mudah kena.",
  },
  {
    kunci: "prefersSignLanguage",
    label: "Utamakan video bahasa isyarat",
    bantuan: "Kalau ada video BISINDO, kami tampilkan lebih dulu.",
  },
  {
    kunci: "screenReaderHint",
    label: "Saya pakai pembaca layar",
    bantuan: "Misalnya TalkBack. Kami pakai ini untuk menata layar.",
  },
];

function useTeksIsi() {
  const { warna, skalaTeks } = useTokenA11y();
  return { color: warna.teks, fontSize: UKURAN_HURUF.isi * skalaTeks };
}

export function LangkahRagam(props: {
  terpilih: readonly string[];
  onUbah: (terpilih: readonly string[]) => void;
}) {
  const teks = useTeksIsi();
  return (
    <View style={{ gap: 12 }}>
      <Text style={teks}>
        Anda boleh beri tahu kondisi Anda. Ini membantu kami mencarikan kerja yang cocok. Anda juga
        boleh tidak menjawab.
      </Text>
      {/* Disebut SEBELUM pilihan ditawarkan: ke mana jawaban pergi. */}
      <Text style={{ ...teks, fontWeight: "700" }}>
        Jawaban ini tidak kami kirim ke mana pun. Jawaban hanya ada di HP Anda, dan hilang setelah
        selesai.
      </Text>
      <Text accessibilityRole="header" style={{ ...teks, fontWeight: "600" }}>
        Pilih kondisi Anda. Boleh pilih lebih dari satu.
      </Text>
      {RAGAM.map(({ nilai, label }) => (
        <KotakCentang
          key={nilai}
          testID={`ragam-${nilai}`}
          label={label}
          dicentang={props.terpilih.includes(nilai)}
          onUbah={(dicentang) =>
            props.onUbah(
              dicentang ? [...props.terpilih, nilai] : props.terpilih.filter((n) => n !== nilai),
            )
          }
        />
      ))}
      <Text style={teks}>Anda boleh lanjut tanpa memilih.</Text>
    </View>
  );
}

export function LangkahPersetujuan(props: {
  setuju: boolean;
  onUbah: (setuju: boolean) => void;
  jumlahDipilih: number;
}) {
  const teks = useTeksIsi();
  return (
    <View style={{ gap: 12 }}>
      <Text style={teks}>
        Data tentang disabilitas adalah data yang sangat pribadi. Undang-undang melindunginya. Kami
        hanya boleh memakainya kalau Anda izinkan.
      </Text>
      <Text style={teks}>• Sampai sekarang, jawaban Anda tidak kami kirim ke mana pun.</Text>
      <Text style={teks}>• Kalau Anda menolak, Anda tetap bisa memakai semua fitur.</Text>
      {/* Tidak pernah tercentang di awal (UU PDP) — layar terpisah dari pilihannya. */}
      <KotakCentang
        testID="kotak-izin"
        label="Ya, saya izinkan data ini dipakai nanti"
        bantuan="Kotak ini kosong. Anda sendiri yang harus mencentangnya."
        dicentang={props.setuju}
        onUbah={props.onUbah}
      />
      <Text style={teks}>
        {props.jumlahDipilih === 0
          ? "Anda belum memilih kondisi apa pun tadi."
          : `Tadi Anda memilih ${props.jumlahDipilih} hal.`}
      </Text>
    </View>
  );
}

/** Efektif dari store yang SAMA dengan PenyediaTema — kendali tidak bisa berbohong. */
function useEfektif() {
  const pilihan = a11yStore((s) => s.pilihanPengguna);
  const os = a11yStore((s) => s.os);
  return useMemo(() => rekonsiliasi(pilihan, os), [pilihan, os]);
}

export function LangkahPreferensi(
  props: { onUbah?: (perubahan: Partial<AccessibilityPreferences>) => void } = {},
) {
  const teks = useTeksIsi();
  const efektif = useEfektif();
  const ubah = (perubahan: Partial<AccessibilityPreferences>) => {
    a11yStore.getState().setPreferensi(perubahan);
    props.onUbah?.(perubahan);
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={teks}>
        Setiap pilihan langsung berubah di layar. Anda bisa lihat hasilnya sekarang juga.
      </Text>

      <Text accessibilityRole="header" style={{ ...teks, fontWeight: "600" }}>
        Besar huruf
      </Text>
      {/* Dua tombol, bukan slider: slider sulit bagi motorik terbatas dan RN inti
          tidak menyediakannya. Nilai terlihat DAN diumumkan saat berubah. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <Tombol
          testID="tombol-perkecil"
          label="Perkecil huruf"
          varian="sekunder"
          nonaktif={efektif.textScale <= SKALA_TEKS.min}
          onPress={() => ubah({ textScale: geserSkala(efektif.textScale, -1) })}
        />
        <Text
          testID="nilai-skala"
          accessibilityLiveRegion="polite"
          style={{ ...teks, fontWeight: "700" }}
        >
          {efektif.textScale} persen
        </Text>
        <Tombol
          testID="tombol-perbesar"
          label="Perbesar huruf"
          varian="sekunder"
          nonaktif={efektif.textScale >= SKALA_TEKS.maks}
          onPress={() => ubah({ textScale: geserSkala(efektif.textScale, 1) })}
        />
      </View>

      <Text accessibilityRole="header" style={{ ...teks, fontWeight: "600" }}>
        Pilihan lain
      </Text>
      {SAKLAR.map(({ kunci, label, bantuan }) => (
        <KotakCentang
          key={kunci}
          testID={`saklar-${kunci}`}
          label={label}
          bantuan={bantuan}
          dicentang={efektif[kunci]}
          onUbah={(dicentang) => ubah({ [kunci]: dicentang })}
        />
      ))}
    </View>
  );
}

export function LangkahRingkasan(props: { ragam: readonly string[]; setuju: boolean }) {
  const teks = useTeksIsi();
  const { warna } = useTokenA11y();
  const efektif = useEfektif();
  const namaRagam = RAGAM.filter((r) => props.ragam.includes(r.nilai)).map((r) => r.label);

  const baris = (label: string, nilai: string) => (
    // Satu elemen TalkBack per baris: "Warna lebih tegas: Menyala".
    <View
      key={label}
      accessible
      accessibilityLabel={`${label}: ${nilai}`}
      style={{ borderBottomWidth: 1, borderColor: warna.garis, paddingVertical: 8 }}
    >
      <Text style={{ ...teks, fontWeight: "600" }}>{label}</Text>
      <Text style={teks}>{nilai}</Text>
    </View>
  );

  return (
    <View style={{ gap: 12 }}>
      <Text style={teks}>Cek dulu. Kalau mau ubah, tekan Kembali.</Text>
      <Text accessibilityRole="header" style={{ ...teks, fontWeight: "700" }}>
        Tampilan aplikasi
      </Text>
      <View>
        {baris("Besar huruf", `${efektif.textScale} persen`)}
        {SAKLAR.map(({ kunci, label }) => baris(label, efektif[kunci] ? "Menyala" : "Mati"))}
      </View>
      <Text accessibilityRole="header" style={{ ...teks, fontWeight: "700" }}>
        Kondisi Anda
      </Text>
      <Text style={teks}>
        {namaRagam.length === 0 ? "Anda tidak memilih apa pun." : namaRagam.join(", ")}
      </Text>
      <Text style={teks}>
        {props.setuju
          ? "Anda izinkan kami memakai data ini nanti."
          : "Anda tidak memberi izin. Itu tidak apa-apa."}
      </Text>
      <Text style={teks}>Bagian ini tidak kami simpan. Bagian ini juga tidak kami kirim.</Text>
    </View>
  );
}
