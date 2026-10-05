// Tab bawah setelah masuk (PR-092; keputusan owner: tab, bukan hub Beranda).
//
// Label TEKS tanpa ikon: label adalah satu-satunya nama yang dibaca TalkBack,
// dan ikon tanpa teks memaksa pengguna menebak. Ukuran label & target sentuh
// mengikuti token, jadi tab membesar bersama preferensi "tombol lebih besar".
import { useTokenA11y, UKURAN_HURUF } from "@nawasena/ui-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { BerandaScreen } from "../screens/BerandaScreen";
import { CvDaftarScreen } from "../screens/cv/CvDaftarScreen";
import { ProfilScreen } from "../screens/profil/ProfilScreen";
import type { TabParamList } from "./types";

const Tab = createBottomTabNavigator<TabParamList>();

export function TabUtama() {
  const { warna, skalaTeks, targetSentuh, kurangiGerak } = useTokenA11y();

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: warna.latar },
        headerTintColor: warna.teks,
        tabBarActiveTintColor: warna.teks,
        tabBarInactiveTintColor: warna.teksLemah,
        tabBarStyle: { backgroundColor: warna.latar, borderTopColor: warna.garis, height: "auto" },
        tabBarItemStyle: { minHeight: targetSentuh, paddingVertical: 6 },
        tabBarIcon: () => null,
        tabBarIconStyle: { display: "none" },
        tabBarLabelStyle: { fontSize: UKURAN_HURUF.label * skalaTeks, fontWeight: "600" },
        animation: kurangiGerak ? "none" : "fade",
      }}
    >
      <Tab.Screen name="Beranda" component={BerandaScreen} options={{ title: "Beranda" }} />
      <Tab.Screen name="Profil" component={ProfilScreen} options={{ title: "Profil" }} />
      <Tab.Screen name="Cv" component={CvDaftarScreen} options={{ title: "CV" }} />
    </Tab.Navigator>
  );
}
