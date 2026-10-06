import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PenyediaTokenA11y } from "@nawasena/ui-native";
import { ACCESSIBILITY_DEFAULTS } from "@nawasena/a11y";
import { employerApi, getMe } from "@nawasena/api-client";
import { EmployerScreen } from "../src/screens/employer/EmployerScreen";
jest.mock("../src/api", () => ({ apiClient: {} }));
jest.mock("../src/query", () => ({ useSub: () => "employer-uji" }));
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ isFocused: () => true, navigate: jest.fn() }),
}));
jest.mock("@nawasena/api-client", () => ({
  ...jest.requireActual("@nawasena/api-client"),
  getMe: jest.fn(),
  employerApi: {
    companies: jest.fn(),
    jobs: jest.fn(),
    register: jest.fn(),
    createJob: jest.fn(),
    jobAction: jest.fn(),
  },
}));
const company = {
  id: "company-uji",
  name: "Perusahaan Demo",
  recruitmentStatus: "pending",
  memberRole: "owner",
  accommodationsAvailable: [],
};
describe("Employer Android", () => {
  let qc: QueryClient;
  beforeEach(() => {
    jest.clearAllMocks();
    qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false, gcTime: Infinity },
      },
    });
    (getMe as jest.Mock).mockResolvedValue({ data: { role: "employer" } });
    (employerApi.companies as jest.Mock).mockResolvedValue([]);
    (employerApi.jobs as jest.Mock).mockResolvedValue([]);
  });
  afterEach(() => qc.clear());
  function open() {
    return render(
      <QueryClientProvider client={qc}>
        <PenyediaTokenA11y preferensi={ACCESSIBILITY_DEFAULTS}>
          <EmployerScreen />
        </PenyediaTokenA11y>
      </QueryClientProvider>,
    );
  }
  it("an employer without membership can register a company", async () => {
    (employerApi.register as jest.Mock).mockResolvedValue(company);
    await open();
    const field = await screen.findByLabelText("Nama perusahaan");
    await fireEvent.changeText(field, "Perusahaan Demo");
    await fireEvent.press(screen.getByRole("button", { name: "Simpan perusahaan" }));
    await waitFor(() =>
      expect(employerApi.register).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ name: "Perusahaan Demo" }),
      ),
    );
  });
  it("pending employers can draft but cannot publish", async () => {
    (employerApi.companies as jest.Mock).mockResolvedValue([company]);
    (employerApi.jobs as jest.Mock).mockResolvedValue([
      { id: "job-uji", title: "Analis", status: "draft", accommodations: ["ramah_screen_reader"] },
    ]);
    await open();
    await screen.findByText("Menunggu persetujuan admin");
    expect(await screen.findByRole("button", { name: "Tayangkan Analis" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Buat lowongan" }));
    expect(await screen.findByLabelText("Judul lowongan")).toBeTruthy();
    expect(employerApi.jobAction).not.toHaveBeenCalled();
  });
  it("failed company load shows retry without a false registration form", async () => {
    (employerApi.companies as jest.Mock).mockRejectedValue(new Error("offline"));
    await open();
    expect(await screen.findByText("Data belum bisa dimuat.")).toBeTruthy();
    expect(screen.queryByLabelText("Nama perusahaan")).toBeNull();
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeTruthy();
  });
});
