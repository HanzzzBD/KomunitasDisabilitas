// Layar kode OTP (PR-090).
//
// Autofill: `autoComplete="sms-otp"` + `textContentType="oneTimeCode"` membuat
// layanan autofill Android/Gboard menawarkan kode dari SMS. Kanal utama OTP
// adalah WhatsApp, yang tidak terjangkau SMS Retriever — itu sebabnya hanya
// hint ini yang dipasang (keputusan owner; lihat utang U-36).
//
// SENGAJA tidak mengirim otomatis saat 6 angka terisi: perubahan konteks yang
// dipicu mengetik mengejutkan pengguna pembaca layar (WCAG 3.2.2). Tombol
// "Masuk" tetap satu langkah yang disengaja.
import { requestOtp, verifyOtp } from "@nawasena/api-client";
import { Masukan, Tombol, UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ScrollView, Text } from "react-native";

import { apiClient, sesiStore } from "../api";
import { formatHitungMundur, pesanGalat, rapikanKode } from "../auth/alur-masuk";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Verifikasi">;

/** Nomor disamarkan di layar: `+62 812-****-7890` — cukup untuk dikenali pemiliknya. */
function samarkan(phone: string): string {
  return `${phone.slice(0, 3)} ${phone.slice(3, 6)}-****-${phone.slice(-4)}`;
}

export function VerifikasiScreen({ route }: Props) {
  const { phone } = route.params;
  const { warna, skalaTeks } = useTokenA11y();
  const [kode, setKode] = useState("");
  const [galatKode, setGalatKode] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [memeriksa, setMemeriksa] = useState(false);
  const [mengirimUlang, setMengirimUlang] = useState(false);
  const [sisaDetik, setSisaDetik] = useState(route.params.retryAfterSeconds);

  useEffect(() => {
    if (sisaDetik <= 0) return;
    const t = setTimeout(() => setSisaDetik((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [sisaDetik]);

  async function periksa() {
    setInfo(undefined);
    if (kode.length !== 6) {
      setGalatKode("Kode harus 6 angka");
      return;
    }
    setGalatKode(undefined);
    setMemeriksa(true);
    try {
      const { data } = await verifyOtp(apiClient, { phone, code: kode, client: "mobile" });
      // Navigasi tidak perlu: status "masuk" mengganti seluruh stack (App.tsx).
      await sesiStore.getState().masuk(data);
    } catch (err) {
      setGalatKode(pesanGalat(err));
      setMemeriksa(false);
    }
  }

  async function kirimUlang() {
    setGalatKode(undefined);
    setMengirimUlang(true);
    try {
      const { data } = await requestOtp(apiClient, { phone });
      setKode("");
      setSisaDetik(data.retryAfterSeconds);
      setInfo("Kode baru sudah dikirim.");
    } catch (err) {
      setInfo(pesanGalat(err));
    } finally {
      setMengirimUlang(false);
    }
  }

  const teks = { color: warna.teks, fontSize: UKURAN_HURUF.isi * skalaTeks };

  return (
    <ScrollView
      testID="layar-verifikasi"
      style={{ backgroundColor: warna.latar }}
      contentContainerStyle={{ padding: 24, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        accessibilityRole="header"
        style={{ color: warna.teks, fontSize: UKURAN_HURUF.judul * skalaTeks, fontWeight: "700" }}
      >
        Masukkan kode
      </Text>
      <Text style={teks}>Kode 6 angka dikirim ke {samarkan(phone)}. Kode berlaku 5 menit.</Text>

      <Masukan
        testID="masukan-kode"
        label="Kode 6 angka"
        nilai={kode}
        ubahNilai={(v) => setKode(rapikanKode(v))}
        galat={galatKode}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
      />

      <Tombol
        testID="tombol-masuk"
        label="Masuk"
        onPress={() => void periksa()}
        sibuk={memeriksa}
        nonaktif={memeriksa}
      />

      {info ? (
        <Text accessibilityLiveRegion="polite" style={teks}>
          {info}
        </Text>
      ) : null}

      {sisaDetik > 0 ? (
        // Bukan live region: diumumkan tiap detik akan menenggelamkan TalkBack.
        <Text style={teks}>Kirim ulang kode dalam {formatHitungMundur(sisaDetik)}</Text>
      ) : (
        <Tombol
          testID="tombol-kirim-ulang"
          label="Kirim ulang kode"
          varian="sekunder"
          onPress={() => void kirimUlang()}
          sibuk={mengirimUlang}
          nonaktif={mengirimUlang || memeriksa}
        />
      )}
    </ScrollView>
  );
}
