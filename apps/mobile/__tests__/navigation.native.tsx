import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { createNavigationContainerRef, NavigationContainer } from "@react-navigation/native";
import { ACCESSIBILITY_DEFAULTS } from "@nawasena/a11y";
import { PenyediaTokenA11y } from "@nawasena/ui-native";
import { AccessibilityInfo, StyleSheet } from "react-native";
import { TabUtama } from "../src/navigation/TabUtama";
import type { TabParamList } from "../src/navigation/types";

// Real tab/stack routers; feature screens stand in for network-backed pages.
// This isolates routing, Back, tab state and touch targets from API availability.
function mockScreen(label: string) {
  const React = require("react");
  const { Judul } = require("../src/komponen/Layar");
  return function Screen() {
    return React.createElement(Judul, {}, label);
  };
}
jest.mock("../src/screens/BerandaScreen", () => ({
  BerandaScreen: mockScreen("Ringkasan Beranda"),
}));
jest.mock("../src/screens/lowongan/CariScreen", () => ({
  CariScreen: mockScreen("Cari lowongan"),
}));
jest.mock("../src/screens/lowongan/FeedScreen", () => ({ FeedScreen: mockScreen("Rekomendasi") }));
jest.mock("../src/screens/lowongan/LowonganDetailScreen", () => ({
  LowonganDetailScreen: mockScreen("Detail lowongan"),
}));
jest.mock("../src/screens/lamaran/LamaranDaftarScreen", () => ({
  LamaranDaftarScreen: mockScreen("Daftar lamaran"),
}));
jest.mock("../src/screens/lamaran/LamaranDetailScreen", () => ({
  LamaranDetailScreen: mockScreen("Detail lamaran"),
}));
jest.mock("../src/screens/cv/CvDaftarScreen", () => ({ CvDaftarScreen: mockScreen("Daftar CV") }));
jest.mock("../src/screens/cv/CvEditorScreen", () => ({ CvEditorScreen: mockScreen("Editor CV") }));
jest.mock("../src/screens/cv/CvBagianScreen", () => ({ CvBagianScreen: mockScreen("Bagian CV") }));
jest.mock("../src/screens/profil/ProfilScreen", () => ({ ProfilScreen: mockScreen("Profil") }));
jest.mock("../src/screens/profil/ProfilDasarScreen", () => ({
  ProfilDasarScreen: mockScreen("Data dasar"),
}));
jest.mock("../src/screens/profil/ProfilSensitifScreen", () => ({
  ProfilSensitifScreen: mockScreen("Profil sensitif"),
}));
jest.mock("../src/screens/profil/KarierScreen", () => ({ KarierScreen: mockScreen("Karier") }));
jest.mock("../src/screens/profil/KarierFormScreen", () => ({
  KarierFormScreen: mockScreen("Form karier"),
}));
jest.mock("../src/screens/profil/UtilityScreen", () => ({
  AksesibilitasScreen: mockScreen("Aksesibilitas"),
  BantuanScreen: mockScreen("Bantuan"),
  PengaturanScreen: mockScreen("Pengaturan"),
}));
jest.mock("../src/screens/notifikasi/NotifikasiScreen", () => ({
  NotifikasiScreen: mockScreen("Notifikasi"),
}));
jest.mock("../src/screens/MasukScreen", () => ({ MasukScreen: mockScreen("Masuk") }));
jest.mock("../src/screens/VerifikasiScreen", () => ({
  VerifikasiScreen: mockScreen("Verifikasi"),
}));
jest.mock("../src/screens/OnboardingScreen", () => ({
  OnboardingScreen: mockScreen("Onboarding"),
}));
jest.mock("../src/notifikasi/TombolNotifikasi", () => ({ HeaderNotifikasi: () => null }));
jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);

async function mulai(besar = false) {
  const ref = createNavigationContainerRef<TabParamList>();
  await render(
    <PenyediaTokenA11y
      preferensi={{ ...ACCESSIBILITY_DEFAULTS, reduceMotion: true, largeTouchTargets: besar }}
    >
      <NavigationContainer ref={ref}>
        <TabUtama />
      </NavigationContainer>
    </PenyediaTokenA11y>,
  );
  return ref;
}

describe("native navigation behavior", () => {
  it("five labeled tabs expose selected state and 44/56 dp targets", async () => {
    const ref = await mulai();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.props.accessibilityLabel)).toEqual([
      "Beranda",
      "Lowongan",
      "Lamaran",
      "CV",
      "Profil",
    ]);
    expect(tabs[0].props.accessibilityState).toEqual({ selected: true });
    tabs.forEach((tab) => {
      const style = StyleSheet.flatten(tab.props.style);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    });
    await fireEvent.press(screen.getByRole("tab", { name: "Lowongan" }));
    expect(ref.getCurrentRoute()?.name).toBe("LowonganDaftar");
    expect(screen.getByRole("tab", { name: "Lowongan" }).props.accessibilityState).toEqual({
      selected: true,
    });
  });
  it("detail keeps all tabs and Back returns to the list in its own stack", async () => {
    const ref = await mulai();
    await act(() =>
      ref.navigate("Cari", { screen: "LowonganDetail", params: { id: "job-1" }, initial: false }),
    );
    expect(ref.getCurrentRoute()?.name).toBe("LowonganDetail");
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(screen.getByRole("tab", { name: "Lowongan" }).props.accessibilityState.selected).toBe(
      true,
    );
    await act(() => ref.goBack());
    expect(ref.getCurrentRoute()?.name).toBe("LowonganDaftar");
  });
  it("switching tabs preserves the CV stack; Back follows tab history", async () => {
    const ref = await mulai(true);
    screen.getAllByRole("tab").forEach((tab) => {
      expect(StyleSheet.flatten(tab.props.style).minHeight).toBeGreaterThanOrEqual(56);
      expect(StyleSheet.flatten(tab.props.style).minWidth).toBeGreaterThanOrEqual(56);
    });
    await act(() =>
      ref.navigate("Cv", { screen: "CvEditor", params: { id: "cv-1" }, initial: false }),
    );
    await fireEvent.press(screen.getByRole("tab", { name: "Profil" }));
    expect(ref.getCurrentRoute()?.name).toBe("ProfilUtama");
    await act(() => ref.goBack());
    expect(ref.getCurrentRoute()?.name).toBe("CvEditor");
    await act(() => ref.goBack());
    expect(ref.getCurrentRoute()?.name).toBe("CvDaftar");
  });
  it("focusing a screen sends accessibility focus to its primary heading", async () => {
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    await mulai();
    await waitFor(() => expect(focus).toHaveBeenCalledWith(expect.anything(), "focus"));
    focus.mockClear();
    await fireEvent.press(screen.getByRole("tab", { name: "Lowongan" }));
    await waitFor(() => expect(focus).toHaveBeenCalledWith(expect.anything(), "focus"));
    focus.mockRestore();
  });
});
