// Koordinator sesi ↔ preferensi akun ↔ onboarding (PR-091).
//
// Murni (deps disuntik, `zustand/vanilla`) supaya urutan dan balapannya diuji
// Vitest. Padanan mobile dari `SambungkanServer` + gerbang onboarding web:
//
//   keluar → masuk : tarik GET /me/accessibility SEKALI, gabungkan per field
//                    (`gabungkanDariServer`, aturan yang SAMA dengan web), lalu
//                    putuskan wizard.
//   masuk → keluar : lupakan pilihan pengguna di perangkat ini — perangkat
//                    bersama tidak boleh menyerahkan preferensi (yang menyiratkan
//                    disabilitas) seseorang kepada pengguna berikutnya.
import {
  ACCESSIBILITY_KEYS,
  gabungkanDariServer,
  profilBelumDiatur,
  type AccessibilityProfile,
  type UpdateAccessibilityPreferences,
} from "@nawasena/a11y";
import { createStore, type StoreApi } from "zustand/vanilla";

import type { StatusSesi } from "../auth/sesi";

/**
 * - `menunggu` — preferensi akun sedang ditarik (layar tunggu singkat).
 * - `perlu`    — wizard ditampilkan.
 * - `selesai`  — langsung ke aplikasi.
 */
export type StatusOnboarding = "menunggu" | "perlu" | "selesai";

/** Penyimpanan penanda per perangkat (AsyncStorage di app, memori di test). */
export interface PenyimpananPenanda {
  getItem(kunci: string): Promise<string | null>;
  setItem(kunci: string, nilai: string): Promise<void>;
}

export const PREFIKS_PENANDA = "nawasena-onboarding-selesai";

export const kunciPenanda = (userId: string): string => `${PREFIKS_PENANDA}:${userId}`;

/**
 * Klaim `sub` dari access token, TANPA verifikasi — hanya untuk menamai penanda
 * per akun di perangkat ini, bukan untuk keputusan keamanan. Server tetap
 * memverifikasi token pada setiap permintaan.
 */
export function subDariToken(token: string | null): string | null {
  const bagian = token?.split(".");
  if (bagian?.length !== 3) return null;
  try {
    const b64 = (bagian[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(dekodeBase64(b64)) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub !== "" ? payload.sub : null;
  } catch {
    return null;
  }
}

const ABJAD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** base64 → string (ASCII/UTF-8 sederhana). Tanpa `atob`: tidak dijamin ada di semua runtime. */
function dekodeBase64(b64: string): string {
  let bit = 0;
  let nilai = 0;
  const bytes: number[] = [];
  for (const c of b64.replace(/=+$/, "")) {
    const i = ABJAD.indexOf(c);
    if (i === -1) throw new Error("base64 tidak sah");
    nilai = (nilai << 6) | i;
    bit += 6;
    if (bit >= 8) {
      bit -= 8;
      bytes.push((nilai >> bit) & 0xff);
    }
  }
  return decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, "0")}`).join(""));
}

/**
 * Keputusan wizard (keputusan owner 2026-10-05): tampil HANYA bila perangkat
 * ini belum menandai selesai DAN akun belum pernah mengatur satu preferensi pun.
 * Pengguna yang sudah mengatur di web tidak ditanya ulang di HP.
 *
 * Profil gagal diambil → `selesai` tanpa ditandai: wizard yang menahan pengguna
 * karena jaringan buruk lebih mengganggu daripada wizard yang muncul nanti.
 */
export function putuskanOnboarding(input: {
  wizardAktif: boolean;
  sudahDitandai: boolean;
  profil: AccessibilityProfile | null;
}): { status: "perlu" | "selesai"; tandai: boolean } {
  if (!input.wizardAktif || input.sudahDitandai) return { status: "selesai", tandai: false };
  if (input.profil === null) return { status: "selesai", tandai: false };
  if (profilBelumDiatur(input.profil)) return { status: "perlu", tandai: false };
  return { status: "selesai", tandai: true };
}

interface StoreSesiMinimal {
  getState(): { status: StatusSesi; accessToken: string | null };
  subscribe(
    cb: (
      s: { status: StatusSesi; accessToken: string | null },
      sebelum: { status: StatusSesi },
    ) => void,
  ): () => void;
}

interface StoreA11yMinimal {
  getState(): {
    pilihanPengguna: UpdateAccessibilityPreferences;
    setPreferensi(perubahan: UpdateAccessibilityPreferences): void;
    hapusPilihan(kunci: (typeof ACCESSIBILITY_KEYS)[number]): void;
  };
}

export interface DepsKoordinator {
  sesi: StoreSesiMinimal;
  a11y: StoreA11yMinimal;
  ambilProfil: () => Promise<AccessibilityProfile>;
  penanda: PenyimpananPenanda;
  wizardAktif: boolean;
}

export interface StateOnboarding {
  status: StatusOnboarding;
  /** Tutup wizard (selesai ATAU dilewati): tulis penanda, lanjut ke aplikasi. */
  selesaikan(): Promise<void>;
}

export function createKoordinatorOnboarding(deps: DepsKoordinator): {
  store: StoreApi<StateOnboarding>;
  lepas: () => void;
} {
  /** Naik setiap kali sesi berganti — hasil tarikan milik sesi lama dibuang. */
  let generasi = 0;
  let subAktif: string | null = null;

  const store = createStore<StateOnboarding>()((set) => ({
    status: "menunggu",
    async selesaikan() {
      set({ status: "selesai" });
      // Penanda gagal ditulis hanya berarti wizard bisa muncul sekali lagi;
      // pengguna tidak ditahan karena kita gagal mencatat untuk diri sendiri.
      if (subAktif !== null)
        await deps.penanda.setItem(kunciPenanda(subAktif), "1").catch(() => undefined);
    },
  }));

  async function periksa(token: string | null) {
    const ini = ++generasi;
    store.setState({ status: "menunggu" });
    const sub = subDariToken(token);
    subAktif = sub;

    // Cuplikan SAAT berangkat — perubahan pengguna selama GET berjalan menang.
    const awal = deps.a11y.getState().pilihanPengguna;
    const profil = await deps.ambilProfil().catch(() => null);
    if (ini !== generasi) return;
    if (profil !== null) {
      const sekarang = deps.a11y.getState().pilihanPengguna;
      deps.a11y.getState().setPreferensi(gabungkanDariServer(profil, awal, sekarang));
    }

    const sudahDitandai =
      sub !== null && (await deps.penanda.getItem(kunciPenanda(sub)).catch(() => null)) === "1";
    if (ini !== generasi) return;

    const keputusan = putuskanOnboarding({ wizardAktif: deps.wizardAktif, sudahDitandai, profil });
    store.setState({ status: keputusan.status });
    if (keputusan.tandai && sub !== null) {
      await deps.penanda.setItem(kunciPenanda(sub), "1").catch(() => undefined);
    }
  }

  function lupakan() {
    generasi++;
    subAktif = null;
    store.setState({ status: "menunggu" });
    for (const kunci of ACCESSIBILITY_KEYS) deps.a11y.getState().hapusPilihan(kunci);
  }

  const lepas = deps.sesi.subscribe((s, sebelum) => {
    if (s.status === "masuk" && sebelum.status !== "masuk") void periksa(s.accessToken);
    // HANYA peralihan masuk → keluar. Boot tanpa sesi (memulihkan → keluar)
    // tidak boleh menghapus preferensi yang diatur sebelum punya akun.
    if (s.status === "keluar" && sebelum.status === "masuk") lupakan();
  });

  // Dibuat saat sesi sudah masuk (mis. hot reload) — periksa sekarang.
  const awal = deps.sesi.getState();
  if (awal.status === "masuk") void periksa(awal.accessToken);

  return { store, lepas };
}
