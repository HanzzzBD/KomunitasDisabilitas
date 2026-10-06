import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PenyediaTokenA11y } from "@nawasena/ui-native";
import { ACCESSIBILITY_DEFAULTS } from "@nawasena/a11y";
import { getAiChatSession, startAiChatSession, finalizeAiChatSession } from "@nawasena/api-client";
import { CvChatScreen } from "../src/screens/cv/CvChatScreen";
import { kirimPesanCv } from "../src/cv/chat";

jest.mock("../src/api", () => ({ apiClient: {} }));
jest.mock("../src/query", () => ({ useSub: () => "pengguna-uji" }));
jest.mock("../src/cv/use-buat-cv", () => ({
  useBuatCvDariProfil: () => ({ mutate: jest.fn(), reset: jest.fn(), isPending: false }),
}));
jest.mock("../src/cv/chat", () => ({ kirimPesanCv: jest.fn() }));
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ isFocused: () => true }),
}));
jest.mock("@nawasena/api-client", () => ({
  ...jest.requireActual("@nawasena/api-client"),
  startAiChatSession: jest.fn(),
  getAiChatSession: jest.fn(),
  finalizeAiChatSession: jest.fn(),
  getAiQuota: jest.fn(async () => ({ fitur: [{ fitur: "cv_chat", sisa: 29, batas: 30 }] })),
}));

const session = {
  id: "sesi-uji",
  status: "active",
  resumeId: null,
  extractionFailedAt: null,
  turns: [{ seq: 0, role: "assistant", content: "Ceritakan pengalaman Anda." }],
};

describe("layar CV AI Android", () => {
  let queryClient: QueryClient;
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false, gcTime: Infinity },
      },
    });
    jest.clearAllMocks();
    (startAiChatSession as jest.Mock).mockResolvedValue(session);
    (getAiChatSession as jest.Mock).mockResolvedValue({
      ...session,
      status: "finalized",
      resumeId: "cv-uji",
    });
    (finalizeAiChatSession as jest.Mock).mockResolvedValue({
      status: "finalizing",
      resumeId: null,
    });
  });
  afterEach(() => queryClient.clear());
  it("mengirim percakapan, menyusun draft, lalu membuka editor dan PDF", async () => {
    (kirimPesanCv as jest.Mock).mockImplementation(async (opsi) => {
      opsi.onTurn({ seq: 1, role: "user", content: opsi.message });
      opsi.onTurn({ seq: 2, role: "assistant", content: "Baik, pengalaman Anda bisa masuk CV." });
    });
    const navigate = jest.fn();
    await render(
      <QueryClientProvider client={queryClient}>
        <PenyediaTokenA11y preferensi={ACCESSIBILITY_DEFAULTS}>
          <CvChatScreen
            navigation={{ navigate } as never}
            route={{ name: "CvChat", key: "chat" }}
          />
        </PenyediaTokenA11y>
      </QueryClientProvider>,
    );
    await screen.findByText("Ceritakan pengalaman Anda.");
    expect(
      screen.getByRole("button", { name: "Susun draft CV" }).props.accessibilityState.disabled,
    ).toBe(true);
    await fireEvent.changeText(
      screen.getByLabelText("Pesan untuk AI"),
      "Saya pernah menjadi kasir.",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Kirim pesan" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Susun draft CV" }).props.accessibilityState.disabled,
      ).toBe(false),
    );
    expect(kirimPesanCv).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Saya pernah menjadi kasir.", sessionId: "sesi-uji" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Susun draft CV" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Periksa CV dan buat PDF" }));
    expect(finalizeAiChatSession).toHaveBeenCalledWith({}, "sesi-uji");
    expect(navigate).toHaveBeenCalledWith("CvEditor", { id: "cv-uji" });
  });
});
