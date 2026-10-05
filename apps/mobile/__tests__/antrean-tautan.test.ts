import { describe, expect, it, vi } from "vitest";

import { createAntreanTautan } from "../src/navigation/antrean-tautan";
import { tujuanDeepLink } from "../src/navigation/deep-link";
import { tujuanPush } from "../src/push/tujuan";

const A = "018f4c1e-0000-7000-8000-00000000aaaa";
const B = "018f4c1e-0000-7000-8000-00000000bbbb";
const data = {
  notificationId: B,
  type: "lamaran.status_berubah",
  applicationId: A,
  jobId: B,
  status: "interview",
};

describe("input tautan/push dari luar", () => {
  it("UUID lamaran dan lowongan dipetakan ke layar yang tepat", () => {
    expect(tujuanDeepLink(`nawasena://lamaran/${A}`)).toEqual({ layar: "LamaranDetail", id: A });
    expect(tujuanDeepLink(`nawasena://lowongan/${B}`)).toEqual({ layar: "LowonganDetail", id: B });
    expect(tujuanDeepLink("nawasena://lamaran")).toEqual({ layar: "Utama", tab: "Lamaran" });
  });
  it.each([
    `nawasena://lamaran/${A}/../${B}`,
    "nawasena://lamaran/bukan-uuid",
    `nawasena://admin/${A}`,
    `https://evil.test/lamaran/${A}`,
    `nawasena://lamaran/%${A}`,
  ])("menolak %s", (url) => {
    expect(tujuanDeepLink(url)).toBeNull();
  });
  it("push PR-048 dibuka berdasarkan applicationId yang tervalidasi", () => {
    expect(tujuanPush(data)).toEqual({ layar: "LamaranDetail", id: A });
  });
  it.each([
    null,
    [],
    {},
    { ...data, status: "unknown" },
    { ...data, applicationId: "../../admin" },
    { ...data, notificationId: "x" },
    { ...data, type: "admin.lamaran_baru" },
    { ...data, url: "nawasena://admin" },
  ])("menolak payload %j", (p) => {
    expect(tujuanPush(p)).toBeNull();
  });
});

describe("cold/warm start", () => {
  it("cold push ditahan sampai navigator, sesi, dan onboarding siap", () => {
    const buka = vi.fn();
    const q = createAntreanTautan(buka);
    q.push("respons-1", data);
    expect(buka).not.toHaveBeenCalled();
    q.aturSiap(true);
    expect(buka).toHaveBeenCalledTimes(1);
    expect(buka).toHaveBeenCalledWith({ layar: "LamaranDetail", id: A });
    q.aturSiap(true);
    expect(buka).toHaveBeenCalledTimes(1);
  });
  it("warm push dibuka segera dan respons cold/listener yang sama didedup", () => {
    const buka = vi.fn();
    const q = createAntreanTautan(buka);
    q.aturSiap(true);
    q.push("respons-1", data);
    q.push("respons-1", data);
    expect(buka).toHaveBeenCalledTimes(1);
    q.push("respons-2", data);
    expect(buka).toHaveBeenCalledTimes(2);
  });
  it("tautan terbaru menggantikan yang tertunda; input invalid tidak mengganti tujuan", () => {
    const buka = vi.fn();
    const q = createAntreanTautan(buka);
    q.url("nawasena://beranda");
    q.url(`nawasena://lamaran/${A}`);
    q.url("nawasena://admin");
    q.aturSiap(true);
    expect(buka).toHaveBeenCalledTimes(1);
    expect(buka).toHaveBeenCalledWith({ layar: "LamaranDetail", id: A });
  });
  it("logout menghapus tujuan tertunda supaya tidak terbuka pada akun berikutnya", () => {
    const buka = vi.fn();
    const q = createAntreanTautan(buka);
    q.push("r1", data);
    q.hapus();
    q.aturSiap(true);
    expect(buka).not.toHaveBeenCalled();
  });
});
