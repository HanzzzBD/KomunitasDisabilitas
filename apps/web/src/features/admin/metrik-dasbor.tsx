// Dasbor metrik pilot (PR-081) — di atas kartu tautan Ringkasan `/admin`
// (keputusan owner 2026-10-02).
//
// TILE = PASANGAN `<dt>`/`<dd>`, BUKAN GRAFIK. Label tile menyebut PERIODE-nya
// ("Pendaftar baru, 30 hari terakhir"), jadi screen reader yang melompat ke satu
// tile tidak perlu mencari konteks di tempat lain (AC "label + nilai + periode").
// Tren ditulis sebagai kalimat (`metrik-tren.ts`); panah hanya penguat visual
// ber-`aria-hidden`.
//
// AUTO-REFRESH SOPAN (keputusan owner): tiap 5 menit — umur cache server —
// dan berhenti saat tab tidak terlihat (bawaan TanStack). Nilai baru masuk
// DIAM-DIAM: tidak ada live region di atas angka (dua belas angka yang
// dibacakan tiap 5 menit adalah gangguan, bukan informasi) dan fokus tidak
// pernah dipindah. Yang berubah terlihat adalah "Data per pukul …".
import { useId, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminKeys, getAdminMetrics, type ApiClient } from "@nawasena/api-client";
import {
  ADMIN_METRICS_PERIODS,
  type AdminFunnel,
  type AdminMetrics,
  type AdminMetricsPeriod,
} from "@nawasena/schemas";
import { Tombol, WilayahMemuat } from "@nawasena/ui";
import { pesanGalatApi } from "../../shared/galat-api.js";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";
import { formatAngka, hitungTren, kalimatTren } from "./metrik-tren.js";

export const INTERVAL_SEGAR_MS = 5 * 60 * 1000;

const KUNCI_PERIODE: Readonly<Record<AdminMetricsPeriod, KunciTeks>> = {
  "7d": "admin.metrik.periode.7d",
  "30d": "admin.metrik.periode.30d",
  semua: "admin.metrik.periode.semua",
};

const TAHAP: ReadonlyArray<{ kunci: keyof AdminFunnel; label: KunciTeks }> = [
  { kunci: "registered", label: "admin.metrik.tahap.registered" },
  { kunci: "profileReady", label: "admin.metrik.tahap.profileReady" },
  { kunci: "applied", label: "admin.metrik.tahap.applied" },
  { kunci: "interviewed", label: "admin.metrik.tahap.interviewed" },
  { kunci: "hired", label: "admin.metrik.tahap.hired" },
];

const KUNCI_FITUR_AI: Readonly<Record<string, KunciTeks>> = {
  cv_chat: "admin.metrik.ai.cv_chat",
  cv_finalize: "admin.metrik.ai.cv_finalize",
  cv_check: "admin.metrik.ai.cv_check",
  simplify_text: "admin.metrik.ai.simplify_text",
  interview_sim: "admin.metrik.ai.interview_sim",
  rerank: "admin.metrik.ai.rerank",
  embed: "admin.metrik.ai.embed",
};

const JAM = new Intl.DateTimeFormat("id-ID", {
  timeStyle: "short",
  dateStyle: "medium",
  timeZone: "Asia/Jakarta",
});

export function DasborMetrik({ klien }: { klien: ApiClient }) {
  const t = useTeks();
  const idJudul = useId();
  const [periode, setPeriode] = useState<AdminMetricsPeriod>("30d");
  const metrik = useQuery({
    queryKey: adminKeys.metrics(periode),
    queryFn: () => getAdminMetrics(klien, periode),
    refetchInterval: INTERVAL_SEGAR_MS,
  });

  return (
    <section aria-labelledby={idJudul} className="flex flex-col gap-4">
      <h2 id={idJudul} className="text-2xl font-semibold text-gray-900">
        {t("admin.metrik.judul")}
      </h2>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-semibold text-gray-900">
          {t("admin.metrik.periode.legend")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {ADMIN_METRICS_PERIODS.map((p) => (
            <label
              key={p}
              className="flex min-h-sentuh cursor-pointer items-center gap-2 rounded-md border-2 border-gray-400 px-3 has-[:checked]:border-gray-900"
            >
              <input
                type="radio"
                name={`${idJudul}-periode`}
                value={p}
                checked={periode === p}
                onChange={() => {
                  setPeriode(p);
                }}
                className="h-5 w-5 accent-gray-900"
              />
              {t(KUNCI_PERIODE[p])}
            </label>
          ))}
        </div>
      </fieldset>

      {metrik.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-base font-medium text-red-700">{t("admin.metrik.gagal")}</p>
          <p className="text-base text-gray-900">
            {pesanGalatApi(metrik.error, t, { JARINGAN_GAGAL: "shell.galat.jaringan" })}
          </p>
          <Tombol
            varian="sekunder"
            onClick={() => {
              void metrik.refetch();
            }}
          >
            {t("admin.metrik.cobaLagi")}
          </Tombol>
        </div>
      ) : (
        <WilayahMemuat memuat={metrik.isPending} label={t("admin.metrik.memuat")}>
          {metrik.data !== undefined && (
            <IsiMetrik
              m={metrik.data}
              menyegarkan={metrik.isFetching}
              segarkan={() => {
                void metrik.refetch();
              }}
            />
          )}
        </WilayahMemuat>
      )}
    </section>
  );
}

function Tile({ label, nilai, catatan }: { label: string; nilai: string; catatan?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-gray-400 p-4">
      <dt className="text-base font-semibold text-gray-900">{label}</dt>
      <dd className="m-0 flex flex-col gap-1">
        <span className="text-3xl font-bold text-gray-900">{nilai}</span>
        {catatan !== undefined && (
          <>
            {/* Pemisah untuk screen reader saja: tanpa ini angka dan kalimat
                tren terbaca menempel ("15Naik 3 …") — temuan NVDA PR-081. */}
            <span className="sr-only">. </span>
            <span className="text-base text-gray-700">{catatan}</span>
          </>
        )}
      </dd>
    </div>
  );
}

function PanahTren({ kini, lalu }: { kini: number; lalu: number }) {
  const { arah } = hitungTren(kini, lalu);
  // Penguat visual saja — maknanya sudah ada di kalimat sebelahnya.
  return <span aria-hidden="true">{arah === "naik" ? "↑ " : arah === "turun" ? "↓ " : "= "}</span>;
}

function IsiMetrik({
  m,
  menyegarkan,
  segarkan,
}: {
  m: AdminMetrics;
  menyegarkan: boolean;
  segarkan: () => void;
}) {
  const t = useTeks();
  const periodeTeks = t(KUNCI_PERIODE[m.period]);
  const tren = (kini: number, lalu: number | undefined) => {
    const kalimat = kalimatTren(t, m.period, kini, lalu);
    return kalimat === null || lalu === undefined ? undefined : (
      <>
        <PanahTren kini={kini} lalu={lalu} />
        {kalimat}
      </>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-base text-gray-700">
          {t("admin.metrik.dataPer", { waktu: JAM.format(new Date(m.generatedAt)) })}
        </p>
        <Tombol
          varian="sekunder"
          ukuran="kecil"
          aria-disabled={menyegarkan}
          aria-busy={menyegarkan}
          onClick={() => {
            if (!menyegarkan) segarkan();
          }}
        >
          {menyegarkan ? t("admin.metrik.menyegarkan") : t("admin.metrik.segarkan")}
        </Tombol>
      </div>

      <section aria-labelledby="admin-metrik-funnel" className="flex flex-col gap-3">
        <h3 id="admin-metrik-funnel" className="text-xl font-semibold text-gray-900">
          {t("admin.metrik.funnel.judul")}
        </h3>
        <p className="text-base text-gray-700">{t("admin.metrik.funnel.penjelasan")}</p>
        <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TAHAP.map(({ kunci, label }) => (
            <Tile
              key={kunci}
              label={t("admin.metrik.labelPeriode", { label: t(label), periode: periodeTeks })}
              nilai={formatAngka(m.funnel[kunci])}
              catatan={tren(m.funnel[kunci], m.previous?.funnel[kunci])}
            />
          ))}
        </dl>
      </section>

      <section aria-labelledby="admin-metrik-northstar" className="flex flex-col gap-3">
        <h3 id="admin-metrik-northstar" className="text-xl font-semibold text-gray-900">
          {t("admin.metrik.northStar.judul")}
        </h3>
        <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile
            label={t("admin.metrik.labelPeriode", {
              label: t("admin.metrik.northStar.periode"),
              periode: periodeTeks,
            })}
            nilai={formatAngka(m.northStar.confirmedInPeriod)}
            catatan={tren(m.northStar.confirmedInPeriod, m.previous?.confirmedInPeriod)}
          />
          <Tile
            label={t("admin.metrik.northStar.total")}
            nilai={formatAngka(m.northStar.confirmedTotal)}
          />
          <Tile
            label={t("admin.metrik.dlq.label")}
            nilai={m.dlqTotal === null ? t("admin.metrik.dlq.takTerbaca") : formatAngka(m.dlqTotal)}
            catatan={m.dlqTotal === null ? undefined : t("admin.metrik.dlq.catatan")}
          />
        </dl>
      </section>

      <section aria-labelledby="admin-metrik-ai" className="flex flex-col gap-3">
        <h3 id="admin-metrik-ai" className="text-xl font-semibold text-gray-900">
          {t("admin.metrik.ai.judul")}
        </h3>
        {m.aiUsage.features.length === 0 ? (
          <p className="text-base text-gray-900">{t("admin.metrik.ai.kosong")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-base text-gray-900">
              <caption className="mb-2 text-left text-base text-gray-700">
                {t("admin.metrik.ai.caption", { sejak: JAM.format(new Date(m.aiUsage.since)) })}
              </caption>
              <thead>
                <tr className="border-b-2 border-gray-900">
                  <th scope="col" className="py-2 pr-4">
                    {t("admin.metrik.ai.kolom.fitur")}
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right">
                    {t("admin.metrik.ai.kolom.permintaan")}
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right">
                    {t("admin.metrik.ai.kolom.tokenMasuk")}
                  </th>
                  <th scope="col" className="py-2 text-right">
                    {t("admin.metrik.ai.kolom.tokenKeluar")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {m.aiUsage.features.map((f) => (
                  <tr key={f.feature} className="border-b border-gray-400">
                    <th scope="row" className="py-2 pr-4 font-normal">
                      {t(KUNCI_FITUR_AI[f.feature] ?? "admin.metrik.ai.lainnya")}
                    </th>
                    <td className="py-2 pr-4 text-right">{formatAngka(f.requests)}</td>
                    <td className="py-2 pr-4 text-right">{formatAngka(f.tokensIn)}</td>
                    <td className="py-2 text-right">{formatAngka(f.tokensOut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
