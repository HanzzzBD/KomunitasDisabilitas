import {
  analyticsPayloadSchema,
  idSchema,
  normalkanPath,
  type AnalyticsEventData,
  type AnalyticsEventName,
} from "@nawasena/schemas";

export interface PenyimpananAnalitik {
  getItem(kunci: string): Promise<string | null>;
  setItem(kunci: string, nilai: string): Promise<void>;
}

const KUNCI_OPT_OUT = "nawasena.analitik.mati";

/** Tanpa identitas akun, judul lowongan, disclosure, atau token pada transport. */
export function createAnalitik(deps: {
  storage: PenyimpananAnalitik;
  url?: string;
  websiteId?: string;
  fetch: typeof fetch;
}) {
  let siap = false;
  let mati = true;
  let path = "/";
  const dalamProses = new Set<string>();
  let url: string | null = null;
  try {
    const parsed = new URL(deps.url ?? "");
    if (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    ) {
      url = parsed.toString().replace(/\/$/, "");
    }
  } catch {
    /* Konfigurasi opsional: tanpa URL, analytics diam. */
  }
  const terkonfigurasi = url !== null && idSchema.safeParse(deps.websiteId).success;
  function aktif() {
    return siap && !mati && terkonfigurasi;
  }
  async function kirim(kandidat: unknown) {
    if (!aktif()) return;
    const hasil = analyticsPayloadSchema.safeParse(kandidat);
    if (!hasil.success) return;
    const p = hasil.data;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      await deps.fetch(`${url}/api/send`, {
        method: "POST",
        credentials: "omit",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "event",
          payload: {
            website: deps.websiteId,
            hostname: "android.nawasena.app",
            language: "id",
            screen: "",
            url: p.path,
            ...(p.type === "event" ? { name: p.name, ...(p.data ? { data: p.data } : {}) } : {}),
          },
        }),
      });
    } catch {
      /* Analytics tidak boleh mengganggu alur pengguna. */
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async mulai() {
      try {
        mati = (await deps.storage.getItem(KUNCI_OPT_OUT)) === "1";
      } catch {
        mati = true;
      }
      siap = true;
    },
    aktif,
    dimatikan: () => mati,
    async aturDimatikan(nilai: boolean) {
      mati = nilai;
      try {
        await deps.storage.setItem(KUNCI_OPT_OUT, nilai ? "1" : "0");
      } catch {
        /* Preferensi tetap berlaku pada sesi ini. */
      }
    },
    pageview(mentah: string) {
      path = normalkanPath(mentah);
      void kirim({ type: "pageview", path });
    },
    track<N extends AnalyticsEventName>(
      name: N,
      ...data: AnalyticsEventData<N> extends undefined ? [] : [AnalyticsEventData<N>]
    ) {
      void kirim({
        type: "event",
        path,
        name,
        ...(data[0] === undefined ? {} : { data: data[0] }),
      });
    },
    async sekaliSaja(kunci: string, kerja: () => void) {
      if (!aktif() || dalamProses.has(kunci)) return;
      dalamProses.add(kunci);
      try {
        const penanda = `nawasena.analitik.sekali.${kunci}`;
        if ((await deps.storage.getItem(penanda)) === "1") return;
        await deps.storage.setItem(penanda, "1");
        if (aktif()) kerja();
      } catch {
        /* Penyimpanan gagal: jangan menghasilkan event ganda. */
      } finally {
        dalamProses.delete(kunci);
      }
    },
  };
}
