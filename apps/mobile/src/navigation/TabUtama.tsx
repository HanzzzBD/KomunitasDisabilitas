import { useTokenA11y } from "@nawasena/ui-native";
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
} from "@react-navigation/bottom-tabs";
import { Pressable, Text, View } from "react-native";
import { HomeStack, JobsStack, ApplicationsStack, ResumeStack, ProfileStack } from "./StackUtama";
import { IkonTab } from "./IkonTab";
import type { TabParamList } from "./types";

const Tab = createBottomTabNavigator<TabParamList>();
export const TAB_UTAMA = ["Beranda", "Cari", "Lamaran", "Cv", "Profil"] as const;
const LABEL = {
  Beranda: "Beranda",
  Cari: "Lowongan",
  Lamaran: "Lamaran",
  Cv: "CV",
  Profil: "Profil",
};

export function TabUtama() {
  const { warna, skalaTeks, targetSentuh, kurangiGerak } = useTokenA11y();
  return (
    <Tab.Navigator
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: warna.teks,
        tabBarInactiveTintColor: warna.teksLemah,
        tabBarStyle: { backgroundColor: warna.latar, borderTopColor: warna.garis, height: "auto" },
        tabBarItemStyle: { minHeight: targetSentuh, paddingVertical: 6 },
        tabBarLabel: ({ focused, color }) => (
          <Text
            accessible={false}
            style={{
              color,
              fontSize: 12 * skalaTeks,
              fontWeight: focused ? "700" : "500",
              textAlign: "center",
              textDecorationLine: focused ? "underline" : "none",
              flexShrink: 1,
            }}
          >
            {LABEL[route.name]}
          </Text>
        ),
        tabBarAccessibilityLabel: LABEL[route.name],
        tabBarIcon: ({ color }) => <IkonTab jenis={route.name} warna={color} />,
        tabBarButton: ({
          children,
          onPress,
          onLongPress,
          style,
          testID,
          "aria-selected": selected,
        }: BottomTabBarButtonProps) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel={LABEL[route.name]}
            accessibilityState={{ selected: selected === true }}
            testID={testID}
            onPress={onPress}
            onLongPress={onLongPress}
            style={[style, { minWidth: targetSentuh, minHeight: targetSentuh }]}
          >
            <View
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ alignItems: "center", width: "100%", padding: 4 }}
            >
              {children}
            </View>
          </Pressable>
        ),
        animation: kurangiGerak ? "none" : "fade",
      })}
    >
      <Tab.Screen name="Beranda" component={HomeStack} options={{ title: "Beranda" }} />
      <Tab.Screen name="Cari" component={JobsStack} options={{ title: "Lowongan" }} />
      <Tab.Screen name="Lamaran" component={ApplicationsStack} options={{ title: "Lamaran" }} />
      <Tab.Screen name="Cv" component={ResumeStack} options={{ title: "CV" }} />
      <Tab.Screen name="Profil" component={ProfileStack} options={{ title: "Profil" }} />
    </Tab.Navigator>
  );
}
