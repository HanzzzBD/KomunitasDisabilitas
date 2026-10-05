// Layar masuk (PR-090): nomor HP → kode OTP, atau Google lewat Credential Manager.
//
// Satu tujuan per layar dan urutan fokus yang sama dengan urutan baca: judul →
// penjelasan → kolom → tombol utama → pemisah → Google. Galat umum (bukan milik
// satu kolom) diumumkan sebagai live region `assertive`, karena pengguna
// TalkBack baru saja menekan tombol dan menunggu jawaban.
import { googleMobileAuth, requestGoogleMobileNonce, requestOtp } from "@nawasena/api-client";
import { phoneNumberSchema } from "@nawasena/schemas";
import { Masukan, Tombol, UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { ScrollView, Text } from "react-native";

import { apiClient, sesiStore } from "../api";
import { normalisasiNomor, pesanGalat } from "../auth/alur-masuk";
import { masukDenganGoogle, serverClientIdGoogle } from "../auth/google";
import { credentialManagerTersedia, pilihAkunGoogle } from "../auth/google-credential";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Masuk">;

const CLIENT_ID_GOOGLE = credentialManagerTersedia ? serverClientIdGoogle() : null;

export function MasukScreen({ navigation }: Props) {
  const { warna, skalaTeks } = useTokenA11y();
  const [nomor, setNomor] = useState("");
  const [galatNomor, setGalatNomor] = useState<string>();
  const [galatUmum, setGalatUmum] = useState<string>();
  const [mengirim, setMengirim] = useState(false);
  const [keGoogle, setKeGoogle] = useState(false);
  const sibuk = mengirim || keGoogle;

  async function kirimKode() {
    setGalatUmum(undefined);
    const phone = normalisasiNomor(nomor);
    const cek = phoneNumberSchema.safeParse(phone);
    if (!cek.success) {
      setGalatNomor("Nomor HP belum benar. Contoh: 0812 3456 7890");
      return;
    }
    setGalatNomor(undefined);
    setMengirim(true);
    try {
      const { data } = await requestOtp(apiClient, { phone });
      navigation.navigate("Verifikasi", { phone, retryAfterSeconds: data.retryAfterSeconds });
    } catch (err) {
      setGalatUmum(pesanGalat(err));
    } finally {
      setMengirim(false);
    }
  }

  async function masukGoogle(serverClientId: string) {
    setGalatUmum(undefined);
    setKeGoogle(true);
    try {
      const hasil = await masukDenganGoogle({
        serverClientId,
        mintaNonce: async () => (await requestGoogleMobileNonce(apiClient)).data.nonce,
        pilihAkun: pilihAkunGoogle,
        tukar: async (idToken) => (await googleMobileAuth(apiClient, { idToken })).data,
      });
      if (hasil.ok) await sesiStore.getState().masuk(hasil.tokens);
      else if (hasil.sebab === "galat") setGalatUmum(hasil.pesan);
    } finally {
      setKeGoogle(false);
    }
  }

  const teks = { color: warna.teks, fontSize: UKURAN_HURUF.isi * skalaTeks };

  return (
    <ScrollView
      testID="layar-masuk"
      style={{ backgroundColor: warna.latar }}
      contentContainerStyle={{ padding: 24, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        accessibilityRole="header"
        style={{ color: warna.teks, fontSize: UKURAN_HURUF.judul * skalaTeks, fontWeight: "700" }}
      >
        Masuk ke Nawasena
      </Text>
      <Text style={teks}>Kami kirim kode 6 angka ke WhatsApp atau SMS di nomor HP Anda.</Text>

      <Masukan
        testID="masukan-nomor"
        label="Nomor HP"
        petunjuk="Contoh: 0812 3456 7890"
        nilai={nomor}
        ubahNilai={setNomor}
        galat={galatNomor}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />

      {galatUmum ? (
        <Text
          testID="galat-masuk"
          accessibilityLiveRegion="assertive"
          style={{ color: warna.bahaya, fontSize: UKURAN_HURUF.isi * skalaTeks }}
        >
          {galatUmum}
        </Text>
      ) : null}

      <Tombol
        testID="tombol-kirim-kode"
        label="Kirim kode"
        onPress={() => void kirimKode()}
        sibuk={mengirim}
        nonaktif={sibuk}
      />

      {CLIENT_ID_GOOGLE === null ? null : (
        <>
          <Text style={{ ...teks, textAlign: "center" }}>atau</Text>
          <Tombol
            testID="tombol-google"
            label="Masuk dengan Google"
            petunjuk="Membuka pilihan akun Google di HP ini"
            varian="sekunder"
            onPress={() => void masukGoogle(CLIENT_ID_GOOGLE)}
            sibuk={keGoogle}
            nonaktif={sibuk}
          />
        </>
      )}
    </ScrollView>
  );
}
