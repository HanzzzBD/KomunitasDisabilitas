import { fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PenyediaTokenA11y } from "@nawasena/ui-native";
import { ACCESSIBILITY_DEFAULTS } from "@nawasena/a11y";
import { updateNotificationPrefs } from "@nawasena/api-client";
import { AktifkanPush } from "../src/push/AktifkanPush";
import { registrasiPush } from "../src/push/instans";

jest.mock("../src/api", () => ({ apiClient: {} }));
jest.mock("../src/query", () => ({ useSub: () => "akun-uji" }));
jest.mock("../src/push/android", () => ({ pushConfigure: true }));
jest.mock("../src/push/instans", () => ({ registrasiPush: { daftarkan: jest.fn() } }));
jest.mock("@nawasena/api-client", () => ({
  ...jest.requireActual("@nawasena/api-client"),
  updateNotificationPrefs: jest.fn(),
}));
describe("aktivasi push eksplisit", () => {
  let cache: QueryClient;
  beforeEach(() => {
    cache = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } },
    });
    jest.clearAllMocks();
  });
  afterEach(() => cache.clear());
  const buka = async () =>
    render(
      <QueryClientProvider client={cache}>
        <PenyediaTokenA11y preferensi={ACCESSIBILITY_DEFAULTS}>
          <AktifkanPush />
        </PenyediaTokenA11y>
      </QueryClientProvider>,
    );
  it("mendaftarkan perangkat dan menyalakan kanal akun sebelum mengaku aktif", async () => {
    (registrasiPush.daftarkan as jest.Mock).mockResolvedValue({ id: "perangkat-uji" });
    (updateNotificationPrefs as jest.Mock).mockResolvedValue({ email: null, push: true });
    await buka();
    await fireEvent.press(screen.getByRole("button", { name: "Aktifkan notifikasi HP" }));
    await screen.findByText("Notifikasi sudah aktif di HP ini.");
    expect(registrasiPush.daftarkan).toHaveBeenCalledWith(true);
    expect(updateNotificationPrefs).toHaveBeenCalledWith({}, { push: true });
  });
  it("izin ditolak tidak menyalakan kanal dan memberi tautan setelan HP", async () => {
    (registrasiPush.daftarkan as jest.Mock).mockResolvedValue(null);
    await buka();
    await fireEvent.press(screen.getByRole("button", { name: "Aktifkan notifikasi HP" }));
    await screen.findByRole("button", { name: "Buka setelan notifikasi HP" });
    expect(updateNotificationPrefs).not.toHaveBeenCalled();
  });
  it("gagal menyimpan kanal tidak menampilkan status aktif", async () => {
    (registrasiPush.daftarkan as jest.Mock).mockResolvedValue({ id: "perangkat-uji" });
    (updateNotificationPrefs as jest.Mock).mockRejectedValue(new Error("offline"));
    await buka();
    await fireEvent.press(screen.getByRole("button", { name: "Aktifkan notifikasi HP" }));
    await screen.findByText(
      "Notifikasi belum berhasil diaktifkan. Periksa koneksi, lalu coba lagi.",
    );
    expect(screen.queryByText("Notifikasi sudah aktif di HP ini.")).toBeNull();
  });
});
