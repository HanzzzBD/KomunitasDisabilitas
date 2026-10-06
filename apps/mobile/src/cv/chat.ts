import { ApiError, resumeAiChatStream, streamAiChat, type ApiClient } from "@nawasena/api-client";
import { aiChatTurnSchema, aiCvChatErrorEventSchema, type AiChatTurn } from "@nawasena/schemas";

/** Sambung jawaban yang sama saat jaringan putus; pesan tidak dikirim ulang. */
export async function kirimPesanCv(opsi: {
  klien: ApiClient;
  sessionId: string;
  message: string;
  signal: AbortSignal;
  onTurn(turn: AiChatTurn): void;
  onToken(token: string): void;
  muatUlang(): Promise<void>;
  tunda?: (ms: number) => Promise<void>;
}): Promise<void> {
  let idTerakhir = 0;
  let aliran = await streamAiChat(
    opsi.klien,
    { sessionId: opsi.sessionId, message: opsi.message },
    opsi.signal,
  );
  for (let percobaan = 0; percobaan <= 3; percobaan += 1) {
    try {
      for await (const event of aliran) {
        if (opsi.signal.aborted) return;
        if (event.id !== undefined) idTerakhir = event.id;
        if (event.event === "giliran") opsi.onTurn(aiChatTurnSchema.parse(JSON.parse(event.data)));
        if (event.event === "token") opsi.onToken(event.data);
        if (event.event === "selesai") return;
        if (event.event === "error") {
          const error = aiCvChatErrorEventSchema.parse(JSON.parse(event.data));
          throw new ApiError(error, 503);
        }
      }
    } catch (err) {
      if (opsi.signal.aborted) return;
      if (err instanceof ApiError) throw err;
    }
    if (opsi.signal.aborted) return;
    if (percobaan === 3) break;
    await (opsi.tunda ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(
      1000 * 2 ** percobaan,
    );
    if (opsi.signal.aborted) return;
    try {
      aliran = await resumeAiChatStream(opsi.klien, opsi.sessionId, idTerakhir, opsi.signal);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        await opsi.muatUlang();
        return;
      }
      aliran = (async function* kosong() {})();
    }
  }
  await opsi.muatUlang();
  throw new Error("Sambungan terputus. Percakapan tersimpan. Coba muat ulang.");
}
