import { afterEach, describe, expect, it, vi } from "vitest";
import { notificationsKeys } from "@nawasena/api-client";
import type {
  Notification,
  NotificationReadAllResponse,
  NotificationReadResponse,
} from "@nawasena/schemas";
import { QueryClient } from "@tanstack/react-query";
import { createKabarNotifikasi } from "../src/notifikasi/kabar";
import { createBacaNotifikasi } from "../src/notifikasi/baca";
import { itemUnik, type HalamanNotifikasi } from "../src/notifikasi/cache";
import { labelItem } from "../src/notifikasi/teks";
import { tujuanNotifikasi } from "../src/notifikasi/tujuan";
import { tujuanPush } from "../src/push/tujuan";
import { tujuanDeepLink } from "../src/navigation/deep-link";

const A = "018f4c1e-0000-7000-8000-00000000aaaa";
const B = "018f4c1e-0000-7000-8000-00000000bbbb";
const C = "018f4c1e-0000-7000-8000-00000000cccc";
const AT = "2026-10-05T00:00:00Z";
function notif(id = A): Notification {
  return {
    id,
    type: "lamaran.terkirim",
    params: { applicationId: C, jobId: B },
    title: { id: "Lamaran telah diterima", "id-simple": "Lamaran terkirim" },
    body: { id: "Pantau prosesnya.", "id-simple": "Lihat kabar lamaran Anda." },
    readAt: null,
    createdAt: AT,
  };
}
const payload = (id = A) => ({
  notificationId: id,
  type: "lamaran.terkirim",
  applicationId: C,
  jobId: B,
});
function koordinator() {
  const k = createKabarNotifikasi();
  k.akun("akun-a");
  k.aturAktif(true);
  k.aturSiap(true);
  return k;
}
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("dedup foreground PR-095", () => {
  it("wizard menahan banner; sesudah selesai baseline tidak mengulang kabar lama", () => {
    vi.useFakeTimers();
    const k = koordinator();
    k.aturSiap(false);
    expect(k.push(payload())).toBe(false);
    k.sinkron([notif()]);
    k.aturSiap(true);
    k.sinkron([notif()]);
    vi.advanceTimersByTime(500);
    expect(k.store.getState().banner).toBeNull();
    k.push(payload(B));
    vi.advanceTimersByTime(500);
    expect(k.store.getState().banner?.jumlah).toBe(1);
  });
  it("pemuatan pertama diam; API baru lalu push duplikat menghasilkan satu banner", () => {
    vi.useFakeTimers();
    const k = koordinator();
    k.sinkron([notif()]);
    vi.advanceTimersByTime(500);
    expect(k.store.getState().banner).toBeNull();
    k.sinkron([notif(B), notif()]);
    k.push(payload(B));
    vi.advanceTimersByTime(500);
    expect(k.store.getState().banner).toMatchObject({
      jumlah: 1,
      id: B,
      tujuan: { layar: "LamaranDetail", id: C },
    });
  });
  it("push dahulu, poll menyusul memperkaya teks tanpa menggandakan jumlah", () => {
    vi.useFakeTimers();
    const k = koordinator();
    k.sinkron([]);
    expect(k.push(payload())).toBe(true);
    expect(k.push(payload())).toBe(false);
    k.sinkron([notif()]);
    vi.advanceTimersByTime(500);
    expect(k.store.getState().banner).toMatchObject({ jumlah: 1, item: notif() });
    k.sinkron([notif()]);
    expect(k.store.getState().banner?.jumlah).toBe(1);
  });
  it("push saat baseline masih dimuat tetap diberitahukan sekali", () => {
    vi.useFakeTimers();
    const k = koordinator();
    k.push(payload());
    k.sinkron([notif()]);
    vi.advanceTimersByTime(500);
    expect(k.store.getState().banner?.jumlah).toBe(1);
  });
  it("burst diringkas ke center; banner bertahan dan burst berikutnya ditambahkan", () => {
    vi.useFakeTimers();
    const k = koordinator();
    k.sinkron([]);
    k.push(payload());
    k.push(payload(B));
    vi.advanceTimersByTime(500);
    expect(k.store.getState().banner).toMatchObject({
      jumlah: 2,
      tujuan: { layar: "Notifikasi" },
      item: null,
    });
    vi.advanceTimersByTime(60_000);
    expect(k.store.getState().banner?.jumlah).toBe(2);
    k.push(payload(C));
    vi.advanceTimersByTime(500);
    expect(k.store.getState().banner?.jumlah).toBe(3);
    k.tutup();
    k.push(payload());
    vi.advanceTimersByTime(500);
    expect(k.store.getState().banner).toBeNull();
  });
  it("background tidak membuat banner; resume menyerap catch-up tanpa push dobel", () => {
    vi.useFakeTimers();
    const k = koordinator();
    k.sinkron([notif()]);
    k.aturAktif(false);
    expect(k.push(payload(B))).toBe(false);
    k.aturAktif(true);
    k.sinkron([notif(B), notif()]);
    vi.advanceTimersByTime(500);
    expect(k.store.getState().banner).toBeNull();
    k.push(payload(C));
    vi.advanceTimersByTime(500);
    expect(k.store.getState().banner?.jumlah).toBe(1);
  });
  it("logout membersihkan banner/timer dan dedup dilingkupi akun", () => {
    vi.useFakeTimers();
    const k = koordinator();
    k.push(payload());
    const versi = k.store.getState().versi;
    k.akun(null);
    vi.advanceTimersByTime(500);
    expect(k.store.getState().banner).toBeNull();
    expect(k.push(payload())).toBe(false);
    k.akun("akun-b");
    k.aturSiap(true);
    expect(k.store.getState().versi).toBeGreaterThan(versi);
    k.push(payload());
    vi.advanceTimersByTime(500);
    expect(k.store.getState().banner?.jumlah).toBe(1);
  });
  it.each([
    null,
    {},
    { ...payload(), applicationId: "../admin" },
    { ...payload(), url: "https://evil.test" },
    { ...payload(), type: "admin.lamaran_baru" },
  ])("payload rusak/admin tidak membuat banner %j", (p) => {
    vi.useFakeTimers();
    const k = koordinator();
    expect(k.push(p)).toBe(false);
    vi.advanceTimersByTime(500);
    expect(k.store.getState().banner).toBeNull();
  });
});

function siapkanCache() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const data: HalamanNotifikasi = {
    pages: [{ data: [notif(), notif(B)], meta: { unreadCount: 5, nextCursor: "cursor" } }],
    pageParams: [undefined],
  };
  for (const belum of [false, true])
    qc.setQueryData<HalamanNotifikasi>(notificationsKeys.daftar("akun-a", belum), data);
  qc.setQueryData(notificationsKeys.lencana("akun-a"), 5);
  return { qc, data };
}
function tertunda<T>() {
  let selesai!: (t: T) => void;
  let gagal!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    selesai = a;
    gagal = b;
  });
  return { promise, selesai, gagal };
}

describe("read flow + cache pemilik", () => {
  it("tandai semua gagal tidak mengubah cache atau badge", async () => {
    const { qc, data } = siapkanCache();
    const baca = createBacaNotifikasi({
      qc,
      sub: "akun-a",
      aktif: () => true,
      satu: vi.fn(),
      semua: async () => {
        throw new Error("offline");
      },
    });
    await expect(baca.jalankan(null)).rejects.toThrow("offline");
    expect(qc.getQueryData(notificationsKeys.daftar("akun-a", false))).toEqual(data);
    expect(qc.getQueryData(notificationsKeys.lencana("akun-a"))).toBe(5);
    qc.clear();
  });
  it("login ulang akun yang sama juga menolak jawaban dari sesi sebelum logout", async () => {
    const { qc } = siapkanCache();
    const k = koordinator();
    const versi = k.store.getState().versi;
    const p = tertunda<NotificationReadResponse>();
    const satu = vi.fn(() => p.promise);
    const baca = createBacaNotifikasi({
      qc,
      sub: "akun-a",
      aktif: () => k.store.getState().sub === "akun-a" && k.store.getState().versi === versi,
      satu,
      semua: vi.fn(),
    });
    const kerja = baca.jalankan(A);
    await vi.waitFor(() => expect(satu).toHaveBeenCalledOnce());
    k.akun(null);
    qc.clear();
    k.akun("akun-a");
    p.selesai({ data: { ...notif(), readAt: AT }, meta: { unreadCount: 4 } });
    await kerja;
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });
  it("read satu optimistis, semua filter/badge kembali persis jika jaringan gagal", async () => {
    const { qc, data } = siapkanCache();
    const p = tertunda<NotificationReadResponse>();
    const baca = createBacaNotifikasi({
      qc,
      sub: "akun-a",
      aktif: () => true,
      satu: () => p.promise,
      semua: vi.fn(),
      sekarang: () => AT,
    });
    const kerja = baca.jalankan(A);
    await vi.waitFor(() => expect(qc.getQueryData(notificationsKeys.lencana("akun-a"))).toBe(4));
    for (const belum of [false, true])
      expect(
        itemUnik(qc.getQueryData<HalamanNotifikasi>(notificationsKeys.daftar("akun-a", belum)))[0]
          ?.readAt,
      ).toBe(AT);
    p.gagal(new Error("jaringan"));
    await expect(kerja).rejects.toThrow("jaringan");
    for (const belum of [false, true])
      expect(qc.getQueryData(notificationsKeys.daftar("akun-a", belum))).toEqual(data);
    expect(qc.getQueryData(notificationsKeys.lencana("akun-a"))).toBe(5);
    qc.clear();
  });
  it("read sukses memakai count server; item/fokus tetap di daftar belum dibaca", async () => {
    const { qc } = siapkanCache();
    const baca = createBacaNotifikasi({
      qc,
      sub: "akun-a",
      aktif: () => true,
      satu: vi.fn(async () => ({ data: { ...notif(), readAt: AT }, meta: { unreadCount: 7 } })),
      semua: vi.fn(),
    });
    await baca.jalankan(A);
    expect(qc.getQueryData(notificationsKeys.lencana("akun-a"))).toBe(7);
    const items = itemUnik(
      qc.getQueryData<HalamanNotifikasi>(notificationsKeys.daftar("akun-a", true)),
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.readAt).toBe(AT);
    qc.clear();
  });
  it("tandai semua tidak optimistis dan tidak memaksa count nol saat kabar baru datang", async () => {
    const { qc, data } = siapkanCache();
    const p = tertunda<NotificationReadAllResponse>();
    const semua = vi.fn(() => p.promise);
    const baca = createBacaNotifikasi({
      qc,
      sub: "akun-a",
      aktif: () => true,
      satu: vi.fn(),
      semua,
    });
    const kerja = baca.jalankan(null);
    await vi.waitFor(() => expect(semua).toHaveBeenCalledOnce());
    expect(qc.getQueryData(notificationsKeys.daftar("akun-a", false))).toEqual(data);
    expect(qc.getQueryData(notificationsKeys.lencana("akun-a"))).toBe(5);
    p.selesai({ data: { ditandai: 5 }, meta: { unreadCount: 2 } });
    await kerja;
    expect(qc.getQueryData(notificationsKeys.lencana("akun-a"))).toBe(2);
    expect(
      itemUnik(qc.getQueryData<HalamanNotifikasi>(notificationsKeys.daftar("akun-a", false))).every(
        (n) => n.readAt !== null,
      ),
    ).toBe(true);
    qc.clear();
  });
  it("jawaban lama setelah logout tidak menghidupkan cache lagi", async () => {
    const { qc } = siapkanCache();
    const p = tertunda<NotificationReadResponse>();
    let aktif = true;
    const satu = vi.fn(() => p.promise);
    const baca = createBacaNotifikasi({
      qc,
      sub: "akun-a",
      aktif: () => aktif,
      satu,
      semua: vi.fn(),
    });
    const kerja = baca.jalankan(A);
    await vi.waitFor(() => expect(satu).toHaveBeenCalledOnce());
    aktif = false;
    qc.clear();
    p.selesai({ data: { ...notif(), readAt: AT }, meta: { unreadCount: 4 } });
    await kerja;
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });
  it("klik ganda menghasilkan satu request", async () => {
    const { qc } = siapkanCache();
    const p = tertunda<NotificationReadResponse>();
    const satu = vi.fn(() => p.promise);
    const baca = createBacaNotifikasi({
      qc,
      sub: "akun-a",
      aktif: () => true,
      satu,
      semua: vi.fn(),
    });
    const a = baca.jalankan(A),
      b = baca.jalankan(A);
    expect(a).toBe(b);
    await vi.waitFor(() => expect(satu).toHaveBeenCalledOnce());
    p.selesai({ data: { ...notif(), readAt: AT }, meta: { unreadCount: 4 } });
    await a;
    qc.clear();
  });
});

describe("teks, pagination, dan navigasi", () => {
  it("item utuh: bahasa sederhana, waktu WIB, dan status dibaca", () => {
    const label = labelItem(notif(), "id-simple");
    expect(label).toContain("Lamaran terkirim");
    expect(label).toContain("Lihat kabar lamaran Anda.");
    expect(label).toContain("07.00 WIB");
    expect(label).toContain("Belum dibaca");
  });
  it("halaman yang overlap tidak menampilkan item dua kali", () => {
    const { data, qc } = siapkanCache();
    expect(
      itemUnik({
        ...data,
        pages: [...data.pages, { ...data.pages[0]!, data: [notif(B), notif(C)] }],
      }).map((n) => n.id),
    ).toEqual([A, B, C]);
    qc.clear();
  });
  it.each(["resume.pdf_siap", "resume.draft_ai_siap"] as const)(
    "CV %s membuka editor dan deep link yang sah",
    (type) => {
      expect(tujuanNotifikasi({ type, params: { resumeId: A } })).toEqual({
        layar: "CvEditor",
        id: A,
      });
      expect(tujuanPush({ notificationId: B, type, resumeId: A })).toEqual({
        layar: "CvEditor",
        id: A,
      });
      expect(tujuanDeepLink(`nawasena://cv/${A}`)).toEqual({ layar: "CvEditor", id: A });
    },
  );
  it("CV AI gagal menuju formulir yang tersedia; sambutan menuju center", () => {
    expect(tujuanPush({ notificationId: B, type: "resume.draft_ai_gagal", sessionId: A })).toEqual({
      layar: "Utama",
      tab: "Cv",
    });
    expect(tujuanPush({ notificationId: B, type: "auth.selamat_datang" })).toEqual({
      layar: "Notifikasi",
    });
    expect(tujuanDeepLink("nawasena://notifikasi")).toEqual({ layar: "Notifikasi" });
    expect(
      tujuanNotifikasi({
        type: "lamaran.terkirim",
        params: { applicationId: "../admin", jobId: B },
      }),
    ).toBeNull();
  });
});
