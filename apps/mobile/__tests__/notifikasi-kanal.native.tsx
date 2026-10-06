import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PenyediaTokenA11y } from "@nawasena/ui-native";
import { ACCESSIBILITY_DEFAULTS } from "@nawasena/a11y";
import { getNotificationPrefs, updateNotificationPrefs } from "@nawasena/api-client";
import { PilihanKanal } from "../src/notifikasi/PilihanKanal";

jest.mock("../src/api", () => ({ apiClient: {} }));
jest.mock("../src/query", () => ({ useSub: () => "akun-uji" }));
jest.mock("../src/push/AktifkanPush", () => ({ AktifkanPush: () => null }));
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ isFocused: () => true }),
}));
jest.mock("@nawasena/api-client", () => ({
  ...jest.requireActual("@nawasena/api-client"),
  getNotificationPrefs: jest.fn(),
  updateNotificationPrefs: jest.fn(),
}));

describe("pilihan kanal Android", () => {
  let cache: QueryClient;
  beforeEach(() => {
    cache = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false, gcTime: Infinity },
      },
    });
    jest.clearAllMocks();
    (getNotificationPrefs as jest.Mock).mockResolvedValue({ email: null, push: null });
  });
  afterEach(() => cache.clear());
  const buka = async () =>
    render(
      <QueryClientProvider client={cache}>
        <PenyediaTokenA11y preferensi={ACCESSIBILITY_DEFAULTS}>
          <PilihanKanal />
        </PenyediaTokenA11y>
      </QueryClientProvider>,
    );
  it("email tetap opt-in; perubahan mengikuti jawaban server", async () => {
    (updateNotificationPrefs as jest.Mock).mockResolvedValue({ email: true, push: null });
    await buka();
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: "Kirim kabar lewat email" }).props.accessibilityState
          .disabled,
      ).toBe(false),
    );
    expect(
      screen.getByRole("checkbox", { name: "Kirim kabar lewat email" }).props.accessibilityState
        .checked,
    ).toBe(false);
    expect(updateNotificationPrefs).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Kirim kabar lewat email" }));
    await screen.findByText("Pilihan notifikasi tersimpan.");
    expect(updateNotificationPrefs).toHaveBeenCalledWith({}, { email: true });
    expect(
      screen.getByRole("checkbox", { name: "Kirim kabar lewat email" }).props.accessibilityState
        .checked,
    ).toBe(true);
  });
  it("gagal menyimpan tidak mengaku email aktif", async () => {
    (updateNotificationPrefs as jest.Mock).mockRejectedValue(new Error("offline"));
    await buka();
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: "Kirim kabar lewat email" }).props.accessibilityState
          .disabled,
      ).toBe(false),
    );
    await fireEvent.press(screen.getByRole("checkbox", { name: "Kirim kabar lewat email" }));
    await screen.findByText("Pilihan belum tersimpan. Periksa koneksi, lalu ubah lagi.");
    expect(
      screen.getByRole("checkbox", { name: "Kirim kabar lewat email" }).props.accessibilityState
        .checked,
    ).toBe(false);
  });
});
