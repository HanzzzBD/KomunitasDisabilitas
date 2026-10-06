import { getMe, usersKeys } from "@nawasena/api-client";
import { useQuery } from "@tanstack/react-query";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { apiClient } from "../api";
import { EmployerScreen } from "../screens/employer/EmployerScreen";
import { Memuat } from "../komponen/Layar";
import { GagalMuat } from "../komponen/GagalMuat";
import { TabUtama } from "./TabUtama";
import { useOpsiStack } from "./StackUtama";
import {
  PengaturanScreen,
  AksesibilitasScreen,
  BantuanScreen,
} from "../screens/profil/UtilityScreen";
import { NotifikasiScreen } from "../screens/notifikasi/NotifikasiScreen";
import type { RootStackParamList } from "./types";
import { useEffect } from "react";
import { perbaruiKesiapanTautan } from "./PantauTautan";
const Stack = createNativeStackNavigator<RootStackParamList>();
export function NavigasiPeran() {
  const me = useQuery({ queryKey: usersKeys.me(), queryFn: () => getMe(apiClient) });
  const options = useOpsiStack();
  useEffect(() => {
    if (me.data) perbaruiKesiapanTautan();
  }, [me.data]);
  if (me.isPending) return <Memuat label="Memuat akun…" />;
  if (me.isError) return <GagalMuat galat={me.error} ulang={() => void me.refetch()} />;
  if (me.data.data.role !== "employer") return <TabUtama />;
  return (
    <Stack.Navigator screenOptions={options} initialRouteName="Employer">
      <Stack.Screen
        name="Employer"
        component={EmployerScreen}
        options={{ title: "Ruang employer" }}
      />
      <Stack.Screen
        name="Pengaturan"
        component={PengaturanScreen}
        options={{ title: "Pengaturan akun" }}
      />
      <Stack.Screen
        name="Aksesibilitas"
        component={AksesibilitasScreen}
        options={{ title: "Aksesibilitas" }}
      />
      <Stack.Screen name="Bantuan" component={BantuanScreen} options={{ title: "Bantuan" }} />
      <Stack.Screen
        name="Notifikasi"
        component={NotifikasiScreen}
        options={{ title: "Notifikasi" }}
      />
    </Stack.Navigator>
  );
}
