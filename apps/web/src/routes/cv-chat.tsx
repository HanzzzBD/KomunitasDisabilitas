// Halaman AI CV Builder — `/cv/chat` (PR-068, PRD FR-3.1).
//
// Tiga janji aksesibilitas yang membentuk halaman ini:
//   1. Giliran AI TERBACA OTOMATIS, per kalimat, lewat satu wilayah
//      `aria-live="polite"` — tanpa memindahkan fokus dari kotak ketik.
//   2. Teks model dirender sebagai TEKS MURNI (children React), tidak pernah
//      sebagai HTML: jawaban AI adalah masukan tak tepercaya.
//   3. Saat AI tidak bisa dipakai, halaman BERALIH DI TEMPAT ke jalur formulir
//      (keputusan owner 2026-09-28): pesan jujur + satu tombol, transkrip tetap
//      terlihat. Tidak ada navigasi otomatis — alur tetap bisa diprediksi.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router";
import {
  aiKeys,
  ApiError,
  finalizeAiChatSession,
  getAiChatSession,
  getAiQuota,
  startAiChatSession,
} from "@nawasena/api-client";
import { AI_CHAT_LIMITS, type AiChatSession, type AiChatTurn } from "@nawasena/schemas";
import { AreaTeks, KolomForm, Tombol, WilayahMemuat } from "@nawasena/ui";
import { useKlienApi } from "../app/klien-api.js";
import { useAiStream, type GalatAliran } from "../features/cv-chat/index.js";
import { useBuatCvDariProfil } from "../features/resume/index.js";
import { idPenggunaSaatIni } from "../features/onboarding/identitas.js";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { bacaTujuanOpsional, denganTujuan } from "../shared/rute/tujuan.js";
import { sekaliSaja, track } from "../shared/analitik.js";
import { Terlindungi } from "../shared/rute/terlindungi.js";

/** Kode pra-aliran yang berarti "chat tidak bisa dipakai sekarang". */
const KODE_DEGRADASI = new Set(["KUOTA_AI_HABIS", "AI_CHAT_DIMATIKAN", "AI_CHAT_SIBUK"]);

export function ChatCv() {
  return (
    <Terlindungi>
      <IsiChatCv />
    </Terlindungi>
  );
}

/** Galat JSON (pra-aliran) → bentuk galat aliran, supaya satu cara menampilkannya. */
function galatDariApi(err: unknown): GalatAliran | null {
  if (!(err instanceof ApiError)) return null;
  return {
    kode: err.code,
    pesan: err.message,
    petunjuk: err.hint ?? "",
    degraded: KODE_DEGRADASI.has(err.code),
  };
}

function IsiChatCv() {
  const t = useTeks();
  const klien = useKlienApi();
  const sub = idPenggunaSaatIni();
  const navigate = useNavigate();
  // PR-078: dibawa dari dialog lamar; diteruskan ke editor CV yang dihasilkan.
  const tujuan = bacaTujuanOpsional(useLocation().search);
  const queryClient = useQueryClient();
  const kotakKetik = useRef<HTMLTextAreaElement>(null);
  const [pesan, setPesan] = useState("");
  useJudulHalaman(t("resume.chat.judul"));

  const kunciSesi = aiKeys.sesiChat(sub);
  // POST, tetapi idempoten di server: mengembalikan SATU sesi terbuka milik
  // pemanggil — sesi baru sudah berisi salam statis (tanpa AI, tanpa kuota).
  const sesi = useQuery({
    queryKey: kunciSesi,
    queryFn: () => startAiChatSession(klien),
    retry: false,
    staleTime: Infinity,
  });
  const kuota = useQuery({ queryKey: aiKeys.kuota(sub), queryFn: () => getAiQuota(klien) });

  const ubahSesi = (fn: (s: AiChatSession) => AiChatSession) => {
    queryClient.setQueryData<AiChatSession>(kunciSesi, (lama) =>
      lama === undefined ? lama : fn(lama),
    );
  };
  const muatUlangSesi = async () => {
    const id = sesi.data?.id;
    if (id === undefined) return;
    queryClient.setQueryData(kunciSesi, await getAiChatSession(klien, id));
  };

  const aliran = useAiStream({
    klien,
    sessionId: sesi.data?.id ?? null,
    teksMengetik: t("resume.chat.mengetik"),
    onGiliran: (turn: AiChatTurn) => {
      ubahSesi((s) => ({
        ...s,
        turns: [...s.turns.filter((x) => x.seq !== turn.seq), turn].sort((a, b) => a.seq - b.seq),
      }));
      if (turn.role === "assistant")
        void queryClient.invalidateQueries({ queryKey: aiKeys.kuota(sub) });
    },
    onPerluMuatUlang: () => {
      void muatUlangSesi();
    },
  });

  const finalisasi = useMutation({
    mutationFn: (id: string) => finalizeAiChatSession(klien, id),
    onSuccess: (hasil) => {
      ubahSesi((s) => ({
        ...s,
        status: hasil.status,
        resumeId: hasil.resumeId,
        extractionFailedAt: null,
        extractionError: null,
      }));
      void queryClient.invalidateQueries({ queryKey: aiKeys.kuota(sub) });
    },
  });

  // Poll hasil ekstraksi (worker) — GET, BUKAN POST sessions: sesudah
  // `finalized`, POST akan melahirkan sesi baru.
  const idSesi = sesi.data?.id;
  const sedangFinalisasi = sesi.data?.status === "finalizing";
  const pantau = useQuery({
    queryKey: [...kunciSesi, "pantau", idSesi],
    queryFn: () => getAiChatSession(klien, idSesi ?? ""),
    enabled: sedangFinalisasi && idSesi !== undefined,
    refetchInterval: 3_000,
  });
  useEffect(() => {
    if (pantau.data !== undefined && pantau.data.status !== "finalizing") {
      queryClient.setQueryData(kunciSesi, pantau.data);
    }
    // `kunciSesi` dibentuk ulang tiap render; isinya hanya bergantung pada `sub`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pantau.data, queryClient, sub]);

  // PR-082 — funnel "cv_dibuat" jalur AI: saat sesi selesai DAN CV-nya lahir.
  // Sekali per CV (penanda lokal), karena halaman ini bisa dibuka ulang.
  const resumeIdFinal = sesi.data?.status === "finalized" ? sesi.data.resumeId : null;
  useEffect(() => {
    if (resumeIdFinal === null) return;
    sekaliSaja(`cv_dibuat.${resumeIdFinal}`, () => {
      track("cv_dibuat", { via: "ai" });
    });
  }, [resumeIdFinal]);

  const buatFormulir = useBuatCvDariProfil({
    klien,
    sub,
    judulBawaan: t("resume.daftar.judulBawaan"),
    onBerhasil: (resume) => {
      void navigate(denganTujuan(`/cv/${resume.id}`, tujuan));
    },
  });

  const galat: GalatAliran | null =
    aliran.galat ?? galatDariApi(sesi.error) ?? galatDariApi(finalisasi.error);
  const modeFormulir = galat?.degraded === true;
  const s = sesi.data;
  const berjalan = aliran.status !== "diam";
  const adaJawaban = s?.turns.some((x) => x.role === "user") ?? false;
  const bolehKetik = s?.status === "active" && !modeFormulir;

  const chatKuota = kuota.data?.fitur.find((f) => f.fitur === "cv_chat");
  const finalizeKuota = kuota.data?.fitur.find((f) => f.fitur === "cv_finalize");

  const kirim = () => {
    const isi = pesan.trim();
    // `aria-disabled`, bukan `disabled`, pada tombol kirim: tombol yang menjadi
    // `disabled` saat masih difokus menjatuhkan fokus ke <body>. Penjaganya di sini.
    if (isi === "" || berjalan || !bolehKetik) return;
    setPesan("");
    void aliran.kirim(isi);
    kotakKetik.current?.focus();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    kirim();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      kirim();
    }
  };

  return (
    <div className="page-frame page-panel flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link to="/cv" className="self-start text-base font-semibold text-gray-900 underline">
          {t("resume.chat.kembali")}
        </Link>
        <h1 className="text-3xl font-bold break-words text-gray-900">{t("resume.chat.judul")}</h1>
        <p className="max-w-2xl text-base text-gray-700">{t("resume.chat.deskripsi")}</p>
      </div>

      {chatKuota !== undefined && finalizeKuota !== undefined ? (
        <p className="rounded border border-gray-400 bg-gray-50 p-3 text-base text-gray-900">
          {t("resume.chat.kuota", {
            sisa: chatKuota.sisa,
            batas: chatKuota.batas,
            sisaDraft: finalizeKuota.sisa,
          })}
        </p>
      ) : null}

      {/* SATU wilayah live untuk seluruh halaman, selalu ada di DOM sebelum isinya
          berubah (syarat NVDA). Tambahan kalimat dibaca berurutan (atomic=false). */}
      <div aria-live="polite" aria-atomic="false" className="sr-only">
        {aliran.pengumuman.map((p) => (
          <p key={p.id}>{p.teks}</p>
        ))}
      </div>

      {modeFormulir ? (
        <section
          aria-labelledby="judul-mode-formulir"
          className="flex flex-col gap-3 rounded border border-gray-900 bg-white p-4"
        >
          <h2 id="judul-mode-formulir" className="text-xl font-bold text-gray-900">
            {t("resume.chat.modeFormulirJudul")}
          </h2>
          <p role="status" className="text-base text-gray-900">
            {galat.pesan}. {t("resume.chat.modeFormulir")}
            {galat.retryAfterSeconds !== undefined
              ? ` ${t("resume.chat.kuotaKembali", {
                  jam: Math.max(1, Math.round(galat.retryAfterSeconds / 3600)),
                })}`
              : ""}
          </p>
          <Tombol
            className="self-start"
            aria-disabled={buatFormulir.isPending}
            onClick={() => {
              if (!buatFormulir.isPending) buatFormulir.mutate();
            }}
          >
            {buatFormulir.isPending
              ? t("resume.chat.membuatFormulir")
              : t("resume.chat.isiFormulir")}
          </Tombol>
        </section>
      ) : null}

      {galat !== null && !modeFormulir ? (
        <p role="alert" className="text-base font-medium text-red-700">
          {galat.pesan}
          {galat.petunjuk !== "" ? `. ${galat.petunjuk}` : ""}
        </p>
      ) : null}

      <WilayahMemuat memuat={sesi.isPending} label={t("resume.chat.memuat")}>
        {s !== undefined ? (
          <>
            <ol
              aria-label={t("resume.chat.transkripLabel")}
              className="flex list-none flex-col gap-3 p-0"
            >
              {s.turns.map((turn) => (
                <li
                  key={turn.seq}
                  className={
                    turn.role === "assistant"
                      ? "rounded border border-gray-300 bg-gray-50 p-3"
                      : "rounded border border-gray-900 bg-white p-3"
                  }
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {turn.role === "assistant"
                      ? t("resume.chat.pewawancara")
                      : t("resume.chat.anda")}
                  </p>
                  <p className="text-base break-words whitespace-pre-wrap text-gray-900">
                    {turn.content}
                  </p>
                </li>
              ))}
              {aliran.draf !== "" ? (
                // Pratinjau yang sedang mengalir DISEMBUNYIKAN dari pembaca layar:
                // isinya sudah diumumkan per kalimat, dan akan diganti giliran
                // tersimpan begitu jawaban selesai.
                <li aria-hidden="true" className="rounded border border-gray-300 bg-gray-50 p-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {t("resume.chat.pewawancara")}
                  </p>
                  <p className="text-base break-words whitespace-pre-wrap text-gray-900">
                    {aliran.draf}
                  </p>
                </li>
              ) : null}
            </ol>

            {aliran.status === "mengetik" && aliran.draf === "" ? (
              <p className="text-base text-gray-700">{t("resume.chat.mengetik")}</p>
            ) : null}
            {aliran.status === "menyambung" ? (
              <p className="text-base text-gray-700">{t("resume.chat.menyambung")}</p>
            ) : null}

            {s.status === "finalizing" ? (
              <p role="status" className="text-base font-medium text-gray-900">
                {t("resume.chat.finalisasiMemproses")}
              </p>
            ) : null}

            {s.status === "finalized" ? (
              <div className="flex flex-col gap-3">
                <p role="status" className="text-base font-medium text-gray-900">
                  {s.resumeId !== null
                    ? t("resume.chat.finalisasiSelesai")
                    : t("resume.chat.draftTerhapus")}
                </p>
                <div className="flex flex-wrap gap-3">
                  {s.resumeId !== null ? (
                    <Link
                      to={denganTujuan(`/cv/${s.resumeId}`, tujuan)}
                      className="inline-flex min-h-sentuh items-center rounded bg-gray-900 px-4 text-base font-semibold text-white"
                    >
                      {t("resume.chat.bukaDraft")}
                    </Link>
                  ) : null}
                  <Tombol
                    varian="sekunder"
                    onClick={() => {
                      void queryClient.invalidateQueries({ queryKey: kunciSesi });
                    }}
                  >
                    {t("resume.chat.mulaiBaru")}
                  </Tombol>
                </div>
              </div>
            ) : null}

            {s.status === "active" && s.extractionFailedAt !== null && !modeFormulir ? (
              <div className="flex flex-col gap-3">
                <p role="status" className="text-base font-medium text-gray-900">
                  {t("resume.chat.finalisasiGagal")}
                </p>
                <Tombol
                  varian="sekunder"
                  className="self-start"
                  aria-disabled={buatFormulir.isPending}
                  onClick={() => {
                    if (!buatFormulir.isPending) buatFormulir.mutate();
                  }}
                >
                  {t("resume.chat.isiFormulir")}
                </Tombol>
              </div>
            ) : null}

            {bolehKetik ? (
              <form onSubmit={onSubmit} className="flex flex-col gap-3">
                <KolomForm
                  label={t("resume.chat.labelPesan")}
                  bantuan={t("resume.chat.bantuanPesan", { maks: AI_CHAT_LIMITS.maxContentChars })}
                >
                  <AreaTeks
                    ref={kotakKetik}
                    value={pesan}
                    maxLength={AI_CHAT_LIMITS.maxContentChars}
                    onChange={(e) => {
                      setPesan(e.target.value);
                    }}
                    onKeyDown={onKeyDown}
                  />
                </KolomForm>
                <div className="flex flex-wrap gap-3">
                  <Tombol type="submit" aria-disabled={berjalan || pesan.trim() === ""}>
                    {berjalan ? t("resume.chat.mengirim") : t("resume.chat.kirim")}
                  </Tombol>
                  <Tombol
                    varian="sekunder"
                    aria-disabled={berjalan || !adaJawaban || finalisasi.isPending}
                    onClick={() => {
                      if (berjalan || !adaJawaban || finalisasi.isPending) return;
                      finalisasi.mutate(s.id);
                    }}
                  >
                    {s.extractionFailedAt !== null
                      ? t("resume.chat.cobaFinalisasi")
                      : t("resume.chat.finalisasi")}
                  </Tombol>
                </div>
              </form>
            ) : null}
          </>
        ) : null}
      </WilayahMemuat>
    </div>
  );
}
