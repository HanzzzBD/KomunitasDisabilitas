// Tab bawah setelah masuk (PR-092; keputusan owner: tab, bukan hub Beranda).
//
// Label TEKS tanpa ikon: label adalah satu-satunya nama yang dibaca TalkBack,
// dan ikon tanpa teks memaksa pengguna menebak. Ukuran label & target sentuh
// mengikuti token, jadi tab membesar bersama preferensi "tombol lebih besar".
import { useTokenA11y, UKURAN_HURUF } from "@nawasena/ui-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { feedMatchingAktif } from "../lowongan/teks";
import { BerandaScreen } from "../screens/BerandaScreen";
import { CvDaftarScreen } from "../screens/cv/CvDaftarScreen";
import { CariScreen } from "../screens/lowongan/CariScreen";
import { FeedScreen } from "../screens/lowongan/FeedScreen";
import { LamaranDaftarScreen } from "../screens/lamaran/LamaranDaftarScreen";
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
      <Tab.Screen
        name="Beranda"
        component={feedMatchingAktif ? FeedScreen : BerandaScreen}
        options={{ title: "Beranda" }}
      />
      <Tab.Screen name="Cari" component={CariScreen} options={{ title: "Cari" }} />
      <Tab.Screen name="Lamaran" component={LamaranDaftarScreen} options={{ title: "Lamaran" }} />
      <Tab.Screen name="Profil" component={ProfilScreen} options={{ title: "Profil" }} />
      <Tab.Screen name="Cv" component={CvDaftarScreen} options={{ title: "CV" }} />
    </Tab.Navigator>
  );
}
