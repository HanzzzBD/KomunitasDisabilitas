// Store sesi (PR-030a) — Security Considerations PR-030: "tidak menyimpan
// access token persisten".
//
// Yang diuji bukan "apakah token tersimpan", melainkan DI MANA ia TIDAK boleh
// berada. Dua tempat itu — localStorage dan state reaktif — keduanya tampak
// wajar sampai seseorang men-serialisasi store ke laporan kesalahan.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ambilTokenAkses, useStoreSesi } from "../src/shared/sesi/store.js";

beforeEach(() => {
  useStoreSesi.getState().keluar();
  localStorage.clear();
});

describe("keadaan awal", () => {
  it("store yang baru dimuat berstatus 'memulihkan', bukan 'keluar'", async () => {
    // DIBACA DARI MODUL YANG BARU DIMUAT, bukan dari store yang sudah dipakai
    // test lain. Versi pertama test ini memanggil `setState({status:
    // "memulihkan"})` lalu memeriksa hasilnya — yang hanya membuktikan
    // `setState` bekerja, dan tetap hijau meski nilai awalnya diubah menjadi
    // "keluar". Uji mutasi yang menangkapnya.
    //
    // Nilai awal inilah yang membuat guard benar: 'keluar' akan melempar
    // pengguna yang SEDANG login ke halaman masuk pada milidetik pertama
    // setiap reload, sebelum jawaban `/auth/refresh` tiba.
    vi.resetModules();
    const modul = await import("../src/shared/sesi/store.js");

    expect(modul.useStoreSesi.getState().status).toBe("memulihkan");
    expect(modul.ambilTokenAkses()).toBeNull();
  });

  it("tanpa sesi, tidak ada token", () => {
    expect(ambilTokenAkses()).toBeNull();
  });
});

describe("token TIDAK berada di state reaktif", () => {
  it("snapshot store tidak memuat token di mana pun", () => {
    useStoreSesi.getState().masuk("token-rahasia-123");

    const snapshot = JSON.stringify(useStoreSesi.getState());
    expect(snapshot).not.toContain("token-rahasia-123");
  });

  it("tetapi klien tetap bisa membacanya", () => {
    useStoreSesi.getState().masuk("token-rahasia-123");

    expect(ambilTokenAkses()).toBe("token-rahasia-123");
  });

  it("memperbarui token TIDAK mengubah state — jadi tidak ada render ulang", () => {
    // Refresh mengganti token tiap ~15 menit. Kalau ia bagian dari state,
    // setiap penggantian merender ulang semua pelanggan demi nilai yang tidak
    // ditampilkan siapa pun.
    useStoreSesi.getState().masuk("token-lama");
    const sebelum = useStoreSesi.getState();

    useStoreSesi.getState().perbarui("token-baru");

    expect(useStoreSesi.getState()).toBe(sebelum);
    expect(ambilTokenAkses()).toBe("token-baru");
  });
});

describe("token TIDAK persisten", () => {
  it("masuk tidak menulis apa pun ke localStorage", () => {
    // Berbeda dari store preferensi aksesibilitas (PR-026) yang memang harus
    // selamat dari reload. Token di localStorage bisa dibaca skrip mana pun
    // yang berhasil masuk ke halaman, dan bertahan setelah tab ditutup.
    useStoreSesi.getState().masuk("token-rahasia-123");

    expect(localStorage.length).toBe(0);
  });

  it("tidak ada kunci localStorage yang memuat tokennya", () => {
    useStoreSesi.getState().masuk("token-rahasia-123");

    const semua = Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? "");
    expect(semua.join("|")).not.toContain("token-rahasia-123");
  });
});

describe("keluar membersihkan keduanya sekaligus", () => {
  it("status dan token tidak bisa menyimpang", () => {
    // Satu-satunya penulis token adalah aksi store, jadi "status keluar tetapi
    // token masih ada" tidak punya jalan untuk terjadi.
    useStoreSesi.getState().masuk("token-rahasia-123");
    expect(ambilTokenAkses()).not.toBeNull();

    useStoreSesi.getState().keluar();

    expect(useStoreSesi.getState().status).toBe("keluar");
    expect(ambilTokenAkses()).toBeNull();
  });
});
