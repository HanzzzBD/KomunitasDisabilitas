import { useTokenA11y } from "@nawasena/ui-native";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useStore } from "zustand";

// Dirakit saat boot, bukan saat permintaan pertama: build non-dev tanpa URL API
// HTTPS langsung gagal di sini (fail-fast), tidak diam-diam di layar fitur.
import { PenyediaTema } from "./a11y/PenyediaTema";
import { sesiStore } from "./api";
import { hapusPdfCv } from "./cv/pdf-android";
import { linking } from "./navigation/linking";
import { TabUtama } from "./navigation/TabUtama";
import { onboardingStore } from "./onboarding/instans";
import type { RootStackParamList } from "./navigation/types";
import { queryClient, saatKeluar } from "./query";
import { CvBagianScreen } from "./screens/cv/CvBagianScreen";
import { CvEditorScreen } from "./screens/cv/CvEditorScreen";
import { MasukScreen } from "./screens/MasukScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { KarierFormScreen } from "./screens/profil/KarierFormScreen";
import { KarierScreen } from "./screens/profil/KarierScreen";
import { ProfilDasarScreen } from "./screens/profil/ProfilDasarScreen";
import { ProfilSensitifScreen } from "./screens/profil/ProfilSensitifScreen";
import { MemulihkanScreen, TerputusScreen } from "./screens/StatusSesiScreen";
import { VerifikasiScreen } from "./screens/VerifikasiScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

// PDF CV di cache berkas memuat kontak pribadi — ikut dibuang saat keluar.
saatKeluar(hapusPdfCv);

/**
 * Guarded stack (PR-090): layar yang tidak boleh dibuka tidak sekadar
 * disembunyikan — ia tidak terdaftar sama sekali. Berganti status sesi berarti
 * berganti seluruh stack, sehingga tombol Kembali sesudah masuk tidak bisa
 * membawa pengguna ke layar OTP, dan sesudah keluar tidak ada riwayat layar
 * akun yang tersisa.
 */
function Navigasi() {
  const status = useStore(sesiStore, (s) => s.status);
  // Gerbang onboarding (PR-091) hanya berarti saat sudah masuk.
  const onboarding = useStore(onboardingStore, (s) => s.status);
  const { warna, kurangiGerak } = useTokenA11y();

  useEffect(() => {
    void sesiStore.getState().pulihkan();
  }, []);

  if (status === "memulihkan") return <MemulihkanScreen />;
  // Preferensi akun sedang ditarik: layar tunggu, bukan Beranda yang lalu
  // berganti tampilan begitu preferensinya tiba.
  if (status === "masuk" && onboarding === "menunggu") return <MemulihkanScreen />;
  if (status === "terputus") return <TerputusScreen />;

  return (
    <NavigationContainer linking={linking}>
      {/* Header & transisi ikut token: kontras tinggi berlaku juga di bilah
          judul, dan "kurangi gerakan" mematikan animasi geser antarlayar. */}
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: warna.latar },
          headerTintColor: warna.teks,
          contentStyle: { backgroundColor: warna.latar },
          animation: kurangiGerak ? "none" : "default",
        }}
      >
        {status === "masuk" && onboarding === "perlu" ? (
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            options={{ title: "Atur aplikasi" }}
          />
        ) : status === "masuk" ? (
          <>
            <Stack.Screen name="Utama" component={TabUtama} options={{ headerShown: false }} />
            <Stack.Screen
              name="ProfilDasar"
              component={ProfilDasarScreen}
              options={{ title: "Data dasar" }}
            />
            <Stack.Screen
              name="ProfilSensitif"
              component={ProfilSensitifScreen}
              options={{ title: "Disabilitas dan akomodasi" }}
            />
            <Stack.Screen name="Karier" component={KarierScreen} options={{ title: "Profil" }} />
            <Stack.Screen
              name="KarierForm"
              component={KarierFormScreen}
              options={{ title: "Profil" }}
            />
            <Stack.Screen
              name="CvEditor"
              component={CvEditorScreen}
              options={{ title: "Ubah CV" }}
            />
            <Stack.Screen
              name="CvBagian"
              component={CvBagianScreen}
              options={{ title: "Ubah CV" }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Masuk" component={MasukScreen} options={{ title: "Masuk" }} />
            <Stack.Screen
              name="Verifikasi"
              component={VerifikasiScreen}
              options={{ title: "Kode masuk" }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export function App() {
  return (
    <SafeAreaProvider>
      {/* Preferensi efektif (pilihan pengguna > setelan Android > bawaan), PR-091. */}
      <QueryClientProvider client={queryClient}>
        <PenyediaTema>
          <Navigasi />
        </PenyediaTema>
      </QueryClientProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
