import { useTokenA11y } from "@nawasena/ui-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { BerandaScreen } from "../screens/BerandaScreen";
import { CariScreen } from "../screens/lowongan/CariScreen";
import { FeedScreen } from "../screens/lowongan/FeedScreen";
import { LowonganDetailScreen } from "../screens/lowongan/LowonganDetailScreen";
import { LamaranDaftarScreen } from "../screens/lamaran/LamaranDaftarScreen";
import { LamaranDetailScreen } from "../screens/lamaran/LamaranDetailScreen";
import { CvDaftarScreen } from "../screens/cv/CvDaftarScreen";
import { CvEditorScreen } from "../screens/cv/CvEditorScreen";
import { CvBagianScreen } from "../screens/cv/CvBagianScreen";
import { CvChatScreen } from "../screens/cv/CvChatScreen";
import { ProfilScreen } from "../screens/profil/ProfilScreen";
import { ProfilDasarScreen } from "../screens/profil/ProfilDasarScreen";
import { ProfilSensitifScreen } from "../screens/profil/ProfilSensitifScreen";
import { KarierScreen } from "../screens/profil/KarierScreen";
import { KarierFormScreen } from "../screens/profil/KarierFormScreen";
import {
  AksesibilitasScreen,
  BantuanScreen,
  PengaturanScreen,
} from "../screens/profil/UtilityScreen";
import { NotifikasiScreen } from "../screens/notifikasi/NotifikasiScreen";
import { MasukScreen } from "../screens/MasukScreen";
import { VerifikasiScreen } from "../screens/VerifikasiScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { HeaderNotifikasi } from "../notifikasi/TombolNotifikasi";
import type { RootStackParamList } from "./types";

// Existing screen parameter contracts are retained during the move into stacks.
// Each navigator registers only its own destinations; cross-tab actions target Utama explicitly.
const Home = createNativeStackNavigator<RootStackParamList>();
const Jobs = createNativeStackNavigator<RootStackParamList>();
const Applications = createNativeStackNavigator<RootStackParamList>();
const Resume = createNativeStackNavigator<RootStackParamList>();
const Profile = createNativeStackNavigator<RootStackParamList>();
const Auth = createNativeStackNavigator<RootStackParamList>();
const Onboarding = createNativeStackNavigator<RootStackParamList>();

export function useOpsiStack() {
  const { warna, kurangiGerak } = useTokenA11y();
  return {
    headerStyle: { backgroundColor: warna.latar },
    headerTintColor: warna.teks,
    contentStyle: { backgroundColor: warna.latar },
    animation: kurangiGerak ? ("none" as const) : ("default" as const),
    headerBackButtonDisplayMode: "default" as const,
    headerBackTitle: "Kembali",
  };
}
const kepala = (judul: string) => ({ header: () => <HeaderNotifikasi judul={judul} /> });

export function HomeStack() {
  return (
    <Home.Navigator screenOptions={useOpsiStack()} initialRouteName="BerandaRingkasan">
      <Home.Screen name="BerandaRingkasan" component={BerandaScreen} options={kepala("Beranda")} />
      <Home.Screen
        name="Rekomendasi"
        component={FeedScreen}
        options={{ title: "Rekomendasi pekerjaan" }}
      />
      <Home.Screen
        name="LowonganDetail"
        component={LowonganDetailScreen}
        options={{ title: "Detail lowongan" }}
      />
      <Home.Screen
        name="Notifikasi"
        component={NotifikasiScreen}
        options={{ title: "Notifikasi" }}
      />
    </Home.Navigator>
  );
}
export function JobsStack() {
  return (
    <Jobs.Navigator screenOptions={useOpsiStack()} initialRouteName="LowonganDaftar">
      <Jobs.Screen name="LowonganDaftar" component={CariScreen} options={kepala("Lowongan")} />
      <Jobs.Screen
        name="LowonganDetail"
        component={LowonganDetailScreen}
        options={{ title: "Detail lowongan" }}
      />
    </Jobs.Navigator>
  );
}
export function ApplicationsStack() {
  return (
    <Applications.Navigator screenOptions={useOpsiStack()} initialRouteName="LamaranDaftar">
      <Applications.Screen
        name="LamaranDaftar"
        component={LamaranDaftarScreen}
        options={kepala("Lamaran")}
      />
      <Applications.Screen
        name="LamaranDetail"
        component={LamaranDetailScreen}
        options={{ title: "Perkembangan lamaran" }}
      />
    </Applications.Navigator>
  );
}
export function ResumeStack() {
  return (
    <Resume.Navigator screenOptions={useOpsiStack()} initialRouteName="CvDaftar">
      <Resume.Screen name="CvDaftar" component={CvDaftarScreen} options={kepala("CV Saya")} />
      <Resume.Screen name="CvChat" component={CvChatScreen} options={{ title: "CV AI" }} />
      <Resume.Screen name="CvEditor" component={CvEditorScreen} options={{ title: "Ubah CV" }} />
      <Resume.Screen
        name="CvBagian"
        component={CvBagianScreen}
        options={{ title: "Ubah bagian CV" }}
      />
    </Resume.Navigator>
  );
}
export function ProfileStack() {
  return (
    <Profile.Navigator screenOptions={useOpsiStack()} initialRouteName="ProfilUtama">
      <Profile.Screen name="ProfilUtama" component={ProfilScreen} options={kepala("Profil")} />
      <Profile.Screen
        name="ProfilDasar"
        component={ProfilDasarScreen}
        options={{ title: "Data dasar" }}
      />
      <Profile.Screen
        name="ProfilSensitif"
        component={ProfilSensitifScreen}
        options={{ title: "Disabilitas dan akomodasi" }}
      />
      <Profile.Screen name="Karier" component={KarierScreen} options={{ title: "Profil karier" }} />
      <Profile.Screen
        name="KarierForm"
        component={KarierFormScreen}
        options={{ title: "Ubah profil karier" }}
      />
      <Profile.Screen
        name="Aksesibilitas"
        component={AksesibilitasScreen}
        options={{ title: "Aksesibilitas" }}
      />
      <Profile.Screen
        name="Pengaturan"
        component={PengaturanScreen}
        options={{ title: "Pengaturan" }}
      />
      <Profile.Screen name="Bantuan" component={BantuanScreen} options={{ title: "Bantuan" }} />
    </Profile.Navigator>
  );
}
export function AuthStack() {
  return (
    <Auth.Navigator screenOptions={useOpsiStack()}>
      <Auth.Screen name="Masuk" component={MasukScreen} options={{ title: "Masuk" }} />
      <Auth.Screen
        name="Verifikasi"
        component={VerifikasiScreen}
        options={{ title: "Kode masuk" }}
      />
    </Auth.Navigator>
  );
}
export function OnboardingStack() {
  return (
    <Onboarding.Navigator screenOptions={useOpsiStack()}>
      <Onboarding.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ title: "Atur aplikasi" }}
      />
    </Onboarding.Navigator>
  );
}
