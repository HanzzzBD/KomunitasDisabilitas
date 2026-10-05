// Wizard onboarding aksesibilitas mobile (PR-091) — paritas PR-035.
//
// Perilaku yang dibawa dari web:
// - empat langkah, "Lewati saja" tersedia di SETIAP langkah;
// - fokus pindah ke judul langkah saat langkah BERGANTI (tidak saat pertama
//   dibuka), supaya TalkBack tidak mulai dari tombol "Lanjut" yang barusan
//   ditekan dan melewati isi langkah baru;
// - "Simpan lalu mulai" mengirim `pilihanPengguna`, BUKAN preferensi efektif:
//   sakelar yang tidak disentuh tetap NULL di akun, sehingga setelan Android
//   tetap berlaku di perangkat mana pun (ADR-008);
// - gagal kirim tidak membatalkan apa pun: preferensi sudah berlaku di HP ini,
//   penanda selesai tetap ditulis, dan pengguna diberi satu jalan keluar.
import { updateAccessibility } from "@nawasena/api-client";
import { Tombol, UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import { useEffect, useReducer, useRef, useState } from "react";
import { AccessibilityInfo, ScrollView, Text, View } from "react-native";

import { a11yStore } from "../a11y/store";
import { apiClient } from "../api";
import { pesanGalat } from "../auth/alur-masuk";
import { onboardingStore } from "../onboarding/instans";
import {
  LangkahPersetujuan,
  LangkahPreferensi,
  LangkahRagam,
  LangkahRingkasan,
} from "../onboarding/Langkah";
import {
  JUDUL_LANGKAH,
  LANGKAH,
  langkahSaatIni,
  reduksiWizard,
  STATE_AWAL,
  type Langkah,
} from "../onboarding/mesin-langkah";

export function OnboardingScreen() {
  const { warna, skalaTeks } = useTokenA11y();
  const [state, kirim] = useReducer(reduksiWizard, STATE_AWAL);
  const [ragam, setRagam] = useState<readonly string[]>([]);
  const [setuju, setSetuju] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string>();

  const langkah = langkahSaatIni(state);
  const judulRef = useRef<Text>(null);
  const gulirRef = useRef<ScrollView>(null);
  const langkahSebelumnya = useRef<Langkah | null>(null);

  useEffect(() => {
    if (langkahSebelumnya.current !== null && langkahSebelumnya.current !== langkah) {
      gulirRef.current?.scrollTo({ y: 0, animated: false });
      if (judulRef.current) AccessibilityInfo.sendAccessibilityEvent(judulRef.current, "focus");
    }
    langkahSebelumnya.current = langkah;
  }, [langkah]);

  const selesaikan = () => void onboardingStore.getState().selesaikan();

  async function simpan() {
    if (menyimpan) return;
    setGalat(undefined);
    setMenyimpan(true);
    try {
      await updateAccessibility(apiClient, a11yStore.getState().pilihanPengguna);
      selesaikan();
    } catch (err) {
      setGalat(pesanGalat(err));
      setMenyimpan(false);
    }
  }

  const teks = { color: warna.teks, fontSize: UKURAN_HURUF.isi * skalaTeks };
  const nomor = state.indeks + 1;

  return (
    <ScrollView
      ref={gulirRef}
      testID="layar-onboarding"
      style={{ backgroundColor: warna.latar }}
      contentContainerStyle={{ padding: 24, gap: 16 }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: warna.teks, fontSize: UKURAN_HURUF.judul * skalaTeks, fontWeight: "700" }}
      >
        Atur aplikasi ini
      </Text>
      <Text style={teks}>
        Ada 4 langkah pendek. Anda boleh lewati semua. Anda juga boleh ubah lagi nanti.
      </Text>

      {/* Progres sebagai teks, bukan warna saja (WCAG 1.4.1). */}
      <Text testID="progres-onboarding" style={{ ...teks, fontWeight: "600" }}>
        Langkah {nomor} dari {LANGKAH.length}
      </Text>

      <Text
        ref={judulRef}
        testID="judul-langkah"
        accessibilityRole="header"
        accessibilityLabel={`Langkah ${nomor} dari ${LANGKAH.length}: ${JUDUL_LANGKAH[langkah]}`}
        style={{ color: warna.teks, fontSize: UKURAN_HURUF.judul * skalaTeks, fontWeight: "600" }}
      >
        {JUDUL_LANGKAH[langkah]}
      </Text>

      {langkah === "ragam" && <LangkahRagam terpilih={ragam} onUbah={setRagam} />}
      {langkah === "persetujuan" && (
        <LangkahPersetujuan setuju={setuju} onUbah={setSetuju} jumlahDipilih={ragam.length} />
      )}
      {langkah === "preferensi" && <LangkahPreferensi />}
      {langkah === "ringkasan" && <LangkahRingkasan ragam={ragam} setuju={setuju} />}

      {galat ? (
        <View accessibilityLiveRegion="assertive" style={{ gap: 4 }}>
          <Text style={{ ...teks, color: warna.bahaya, fontWeight: "700" }}>{galat}</Text>
          <Text style={teks}>Pilihan Anda tetap berlaku di HP ini.</Text>
        </View>
      ) : null}

      {/* Membungkus di skala teks 200%: tombol turun ke baris baru, tidak terpotong. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {state.indeks > 0 && (
          <Tombol
            testID="tombol-kembali"
            label="Kembali"
            varian="sekunder"
            onPress={() => kirim({ type: "MUNDUR" })}
          />
        )}
        {langkah !== "ringkasan" ? (
          <Tombol testID="tombol-lanjut" label="Lanjut" onPress={() => kirim({ type: "MAJU" })} />
        ) : galat ? (
          <Tombol testID="tombol-lanjutkan-saja" label="Lanjutkan saja" onPress={selesaikan} />
        ) : (
          <Tombol
            testID="tombol-simpan"
            label={menyimpan ? "Sebentar, sedang menyimpan" : "Simpan lalu mulai"}
            sibuk={menyimpan}
            onPress={() => void simpan()}
          />
        )}
        <Tombol
          testID="tombol-lewati"
          label="Lewati saja"
          varian="sekunder"
          petunjuk="Pilihan yang sudah Anda ubah tetap berlaku di HP ini"
          onPress={selesaikan}
        />
      </View>
    </ScrollView>
  );
}
