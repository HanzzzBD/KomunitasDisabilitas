import { ACCESSIBILITY_DEFAULTS } from "@nawasena/a11y";
import { PenyediaTokenA11y } from "@nawasena/ui-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Dirakit saat boot, bukan saat permintaan pertama: build non-dev tanpa URL API
// HTTPS langsung gagal di sini (fail-fast), tidak diam-diam di layar fitur.
import "./api";
import { linking } from "./navigation/linking";
import type { RootStackParamList } from "./navigation/types";
import { BerandaScreen } from "./screens/BerandaScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function App() {
  return (
    <SafeAreaProvider>
      {/* Preferensi bawaan dulu; store + sinkron akun disambungkan di PR-091. */}
      <PenyediaTokenA11y preferensi={ACCESSIBILITY_DEFAULTS}>
        <NavigationContainer linking={linking}>
          <Stack.Navigator>
            <Stack.Screen name="Beranda" component={BerandaScreen} options={{ title: "Beranda" }} />
          </Stack.Navigator>
        </NavigationContainer>
      </PenyediaTokenA11y>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
