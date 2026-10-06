import { useTokenA11y } from "@nawasena/ui-native";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useStore } from "zustand";

// Dirakit saat boot, bukan saat permintaan pertama: build non-dev tanpa URL API
// HTTPS langsung gagal di sini (fail-fast), tidak diam-diam di layar fitur.
import { PenyediaTema } from "./a11y/PenyediaTema";
import { sesiStore } from "./api";
import { hapusPdfCv } from "./cv/pdf-android";
import { PantauTautan, navigationRef, perbaruiKesiapanTautan } from "./navigation/PantauTautan";
import { analitik, analitikSiap } from "./analitik/instans";
import { pathAnalitik } from "./analitik/rute";
import { TabUtama } from "./navigation/TabUtama";
import { onboardingStore } from "./onboarding/instans";
import type { RootNavigatorParamList } from "./navigation/types";
import { AuthStack, OnboardingStack } from "./navigation/StackUtama";
import { queryClient, saatKeluar } from "./query";
import { BannerNotifikasi } from "./notifikasi/BannerNotifikasi";
import { PantauNotifikasi } from "./notifikasi/PantauNotifikasi";
import { MemulihkanScreen, TerputusScreen } from "./screens/StatusSesiScreen";

const Stack = createNativeStackNavigator<RootNavigatorParamList>();

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
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        perbaruiKesiapanTautan();
        void analitikSiap.then(() =>
          analitik.pageview(pathAnalitik(navigationRef.getCurrentRoute()?.name ?? "")),
        );
      }}
      onStateChange={() => {
        perbaruiKesiapanTautan();
        analitik.pageview(pathAnalitik(navigationRef.getCurrentRoute()?.name ?? ""));
      }}
    >
      <View style={{ flex: 1 }}>
        <BannerNotifikasi />
        {/* Header & transisi ikut token: kontras tinggi berlaku juga di bilah
          judul, dan "kurangi gerakan" mematikan animasi geser antarlayar. */}
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: warna.latar },
            headerTintColor: warna.teks,
            contentStyle: { backgroundColor: warna.latar },
            animation: kurangiGerak ? "none" : "default",
            headerShown: false,
          }}
        >
          {status === "masuk" && onboarding === "perlu" ? (
            <Stack.Screen
              name="OnboardingFlow"
              component={OnboardingStack}
              options={{ title: "Atur aplikasi" }}
            />
          ) : status === "masuk" ? (
            <Stack.Screen name="Utama" component={TabUtama} />
          ) : (
            <Stack.Screen name="Auth" component={AuthStack} />
          )}
        </Stack.Navigator>
      </View>
    </NavigationContainer>
  );
}

export function App() {
  return (
    <SafeAreaProvider>
      {/* Preferensi efektif (pilihan pengguna > setelan Android > bawaan), PR-091. */}
      <QueryClientProvider client={queryClient}>
        <PenyediaTema>
          <PantauTautan />
          <PantauNotifikasi />
          <Navigasi />
        </PenyediaTema>
      </QueryClientProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
