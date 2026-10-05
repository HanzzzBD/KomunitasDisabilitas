import { ACCESSIBILITY_DEFAULTS } from "@nawasena/a11y";
import { PenyediaTokenA11y } from "@nawasena/ui-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useStore } from "zustand";

// Dirakit saat boot, bukan saat permintaan pertama: build non-dev tanpa URL API
// HTTPS langsung gagal di sini (fail-fast), tidak diam-diam di layar fitur.
import { sesiStore } from "./api";
import { linking } from "./navigation/linking";
import type { RootStackParamList } from "./navigation/types";
import { BerandaScreen } from "./screens/BerandaScreen";
import { MasukScreen } from "./screens/MasukScreen";
import { MemulihkanScreen, TerputusScreen } from "./screens/StatusSesiScreen";
import { VerifikasiScreen } from "./screens/VerifikasiScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Guarded stack (PR-090): layar yang tidak boleh dibuka tidak sekadar
 * disembunyikan — ia tidak terdaftar sama sekali. Berganti status sesi berarti
 * berganti seluruh stack, sehingga tombol Kembali sesudah masuk tidak bisa
 * membawa pengguna ke layar OTP, dan sesudah keluar tidak ada riwayat layar
 * akun yang tersisa.
 */
function Navigasi() {
  const status = useStore(sesiStore, (s) => s.status);

  useEffect(() => {
    void sesiStore.getState().pulihkan();
  }, []);

  if (status === "memulihkan") return <MemulihkanScreen />;
  if (status === "terputus") return <TerputusScreen />;

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator>
        {status === "masuk" ? (
          <Stack.Screen name="Beranda" component={BerandaScreen} options={{ title: "Beranda" }} />
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
      {/* Preferensi bawaan dulu; store + sinkron akun disambungkan di PR-091. */}
      <PenyediaTokenA11y preferensi={ACCESSIBILITY_DEFAULTS}>
        <Navigasi />
      </PenyediaTokenA11y>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
