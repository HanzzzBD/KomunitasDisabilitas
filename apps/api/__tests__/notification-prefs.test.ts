// Unit service preferensi kanal notifikasi (PR-049b) — AC-3 sisi penyimpanan.
//
// Yang dijaga berkas ini, dan alasannya masing-masing:
//
//   * `null` = "belum pernah memilih", BUKAN "memilih bawaan". Ini pelajaran
//     yang sudah dibayar mahal di preferensi aksesibilitas (PR-036R): bawaan
//     yang dituliskan ke baris membuat perubahan kebijakan bawaan di kemudian
//     hari tidak pernah menjangkau siapa pun.
//   * Perubahan SEBAGIAN benar-benar sebagian — kanal yang tidak disebut tidak
//     boleh ikut berubah.
//   * Kolom `Json?` tidak dipercaya bentuknya. DB tidak menegakkan apa pun di
//     sana, dan bentuk rusak TIDAK boleh jatuh ke "semua kanal menyala".
import { describe, it, expect } from "vitest";
import { kanalBerlaku, NOTIFICATION_CHANNEL_DEFAULTS } from "@nawasena/schemas";
import { AppError } from "../src/core/http/index.js";
import { createNotificationPrefsService, uraiPrefs } from "../src/modules/users/index.js";

const USER = "018f4c1e-0000-7000-8000-00000000aaaa";
const actor = { userId: USER, requestId: "018f4c1e-0000-7000-8000-0000000000ff" };

function rakit(awal: unknown, opsi: { hilang?: boolean } = {}) {
  let tersimpan: unknown = awal;
  const tulisan: unknown[] = [];

  const service = createNotificationPrefsService({
    userRepository: {
      findNotificationPrefs: async () =>
        opsi.hilang === true ? null : { prefs: tersimpan },
      updateNotificationPrefs: async (_id, prefs) => {
        if (opsi.hilang === true) return null;
        tulisan.push(prefs);
        tersimpan = prefs;
        return { prefs };
      },
    },
  });

  return { service, tulisan, lihat: () => tersimpan };
}

describe("membaca preferensi", () => {
  it("akun yang belum pernah memilih menjawab dua null — bukan bawaan", async () => {
    // Kalau yang dijawab bawaan, "belum memilih" tidak punya bentuk di kabel,
    // dan toggle tidak bisa lagi membedakan "saya menyalakannya" dari
    // "kebetulan bawaannya menyala".
    const { service } = rakit(null);

    await expect(service.getMe(actor)).resolves.toEqual({ email: null, push: null });
  });

  it("pilihan yang tersimpan dijawab apa adanya", async () => {
    const { service } = rakit({ email: true, push: false });

    await expect(service.getMe(actor)).resolves.toEqual({ email: true, push: false });
  });

  it("akun hilang di antara guard dan query → SESI_TIDAK_VALID", async () => {
    const { service } = rakit(null, { hilang: true });

    await expect(service.getMe(actor)).rejects.toBeInstanceOf(AppError);
  });
});

describe("kolom jsonb tidak dipercaya bentuknya", () => {
  it.each([
    ["bukan objek", "email=on"],
    ["kanal asing saja", { whatsapp: true }],
    ["tipe salah", { email: "ya", push: 1 }],
    ["setengah bentuk", { email: true }],
  ])("%s → dibaca sebagai belum memilih", (_nama, rusak) => {
    expect(uraiPrefs(rusak)).toEqual({ email: null, push: null });
  });

  it("bentuk rusak jatuh ke bawaan, dan bawaan email adalah MATI", () => {
    // Inilah kenapa arah jatuhnya penting: bentuk rusak yang jatuh ke "semua
    // menyala" akan mengirimi orang email yang tidak pernah ia minta — cara
    // tercepat membuat seluruh kanal ini masuk folder spam.
    expect(kanalBerlaku(uraiPrefs("rusak")).email).toBe(false);
  });
});

describe("perubahan sebagian", () => {
  it("kanal yang tidak disebut TIDAK ikut berubah", async () => {
    const { service, lihat } = rakit({ email: true, push: false });

    await service.updateMe(actor, { push: true });

    expect(lihat()).toEqual({ email: true, push: true });
  });

  it("null adalah perintah HAPUS, bukan nilai", async () => {
    // Mengembalikan kanal ke "belum memilih" supaya bawaan berlaku lagi —
    // bentuk yang sama dengan tombol "kembalikan ke bawaan" di panel
    // aksesibilitas, dan alasannya sama.
    const { service } = rakit({ email: true, push: false });

    const hasil = await service.updateMe(actor, { email: null });

    expect(hasil).toEqual({ email: null, push: false });
    expect(kanalBerlaku(hasil).email).toBe(NOTIFICATION_CHANNEL_DEFAULTS.email);
  });

  it("menulis di atas baris yang belum pernah ada", async () => {
    const { service } = rakit(null);

    await expect(service.updateMe(actor, { email: true })).resolves.toEqual({
      email: true,
      push: null,
    });
  });

  it("menulis di atas kolom yang bentuknya rusak tidak mewarisi sampahnya", async () => {
    const { service, lihat } = rakit({ whatsapp: true, email: "ya" });

    await service.updateMe(actor, { push: false });

    expect(lihat()).toEqual({ email: null, push: false });
  });

  it("akun hilang saat menulis → SESI_TIDAK_VALID", async () => {
    const { service } = rakit(null, { hilang: true });

    await expect(service.updateMe(actor, { email: true })).rejects.toBeInstanceOf(AppError);
  });
});

describe("pembacaan untuk produser job", () => {
  it("akun yang tidak ditemukan menjawab belum memilih, bukan melempar", async () => {
    // Pemanggilnya pelanggan event yang pekerjaan utamanya sudah selesai; kabar
    // yang tidak jadi diantre tidak boleh menjatuhkannya.
    const { service } = rakit(null, { hilang: true });

    await expect(service.untukProduser(USER)).resolves.toEqual({ email: null, push: null });
  });

  it("dan 'belum memilih' berarti email TIDAK diantrekan", async () => {
    const { service } = rakit(null, { hilang: true });

    expect(kanalBerlaku(await service.untukProduser(USER)).email).toBe(false);
  });
});

describe("bawaan tiap kanal", () => {
  it("email MATI (opt-in), push HIDUP (opt-out)", () => {
    // Angka ini dipakai server DAN klien; dua salinan berarti tombol yang
    // menyala sementara kabarnya tidak dikirim.
    expect(NOTIFICATION_CHANNEL_DEFAULTS).toEqual({ email: false, push: true });
    expect(kanalBerlaku(null)).toEqual({ email: false, push: true });
    expect(kanalBerlaku({ email: null, push: null })).toEqual({ email: false, push: true });
  });

  it("pilihan pengguna selalu menang atas bawaan", () => {
    expect(kanalBerlaku({ email: true, push: false })).toEqual({ email: true, push: false });
  });
});
