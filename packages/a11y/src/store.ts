// `useA11yStore` — state global preferensi aksesibilitas (ADR-008, ADR-014).
//
// BEBAS DOM dengan sengaja. Penyimpanan disuntikkan, bukan diambil dari
// `localStorage` langsung, karena paket ini dipakai mobile juga (SDD §4.2):
// di sana penyimpanannya AsyncStorage, dan `localStorage` tidak ada. Adapter
// web (PR-026b) yang menyediakan implementasi browsernya.
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import {
  updateAccessibilityPreferencesSchema,
  type AccessibilityPreferences,
  type UpdateAccessibilityPreferences,
} from "@nawasena/schemas";
import { rekonsiliasi, type SinyalOS } from "./rekonsiliasi.js";

/**
 * Versi bentuk state tersimpan. NAIKKAN saat bentuknya berubah — bukan saat
 * isinya berubah.
 *
 * Nilai tersimpan hidup di perangkat pengguna selama berbulan-bulan dan tidak
 * bisa kita migrasikan dari server. Versi inilah satu-satunya cara membedakan
 * "bentuk lama yang kita kenal" dari "sampah yang harus dibuang".
 */
export const VERSI_STORE = 1;

export const KUNCI_PENYIMPANAN = "nawasena-a11y";

export interface A11yState {
  /**
   * HANYA yang benar-benar dipilih pengguna. Lihat catatan di `rekonsiliasi()`
   * tentang mengapa ini objek sebagian, bukan profil utuh.
   */
  pilihanPengguna: UpdateAccessibilityPreferences;
  /** Sinyal OS terakhir yang diketahui. Tidak ikut disimpan — selalu dibaca ulang. */
  os: SinyalOS;

  setPreferensi: (perubahan: UpdateAccessibilityPreferences) => void;
  /** Kembalikan satu preferensi ke "ikuti perangkat / bawaan". */
  hapusPilihan: (kunci: keyof AccessibilityPreferences) => void;
  setSinyalOS: (os: SinyalOS) => void;
  /** Preferensi efektif setelah rekonsiliasi — inilah yang dipakai UI. */
  efektif: () => AccessibilityPreferences;
}

/**
 * Bersihkan state tersimpan sebelum dipakai.
 *
 * `localStorage` bisa disunting tangan, disalin antar-profil browser, atau
 * ditinggalkan versi lama aplikasi. Memvalidasinya dengan skema yang sama
 * dengan API berarti nilai asing tidak punya jalan masuk — dan yang rusak
 * jatuh ke bawaan alih-alih menjatuhkan aplikasi saat boot.
 */
export function bersihkanTersimpan(mentah: unknown): UpdateAccessibilityPreferences {
  if (typeof mentah !== "object" || mentah === null) return {};

  const kandidat = (mentah as { pilihanPengguna?: unknown }).pilihanPengguna ?? mentah;
  const hasil = updateAccessibilityPreferencesSchema.safeParse(kandidat);
  if (hasil.success) return hasil.data;

  // Gagal seluruhnya? Selamatkan yang masih sah, buang sisanya. Membuang
  // SEMUA preferensi hanya karena satu field rusak berarti menghukum pengguna
  // atas kesalahan yang bukan miliknya.
  if (typeof kandidat !== "object" || kandidat === null) return {};
  const selamat: Record<string, unknown> = {};
  for (const [kunci, nilai] of Object.entries(kandidat)) {
    const satu = updateAccessibilityPreferencesSchema.safeParse({ [kunci]: nilai });
    if (satu.success) Object.assign(selamat, satu.data);
  }
  return selamat as UpdateAccessibilityPreferences;
}

export interface OpsiStore {
  /** Penyimpanan platform. Web: localStorage; mobile: AsyncStorage; test: memori. */
  storage: StateStorage;
  /** Nama kunci penyimpanan — dapat diubah untuk isolasi test. */
  nama?: string;
}

export type A11yStore = UseBoundStore<StoreApi<A11yState>>;

export function createA11yStore(opsi: OpsiStore): A11yStore {
  return create<A11yState>()(
    persist(
      (set, get) => ({
        pilihanPengguna: {},
        os: {},

        setPreferensi: (perubahan) => {
          set((s) => ({ pilihanPengguna: { ...s.pilihanPengguna, ...perubahan } }));
        },

        hapusPilihan: (kunci) => {
          set((s) => {
            // Hapus kuncinya, bukan setel ke `false`. Menyetel `false` berarti
            // "pengguna memilih tidak" — dan itu akan memblokir sinyal OS
            // selamanya, persis kebalikan dari maksud tombol ini.
            const { [kunci]: _dibuang, ...sisa } = s.pilihanPengguna;
            return { pilihanPengguna: sisa };
          });
        },

        setSinyalOS: (os) => {
          set({ os });
        },

        efektif: () => rekonsiliasi(get().pilihanPengguna, get().os),
      }),
      {
        name: opsi.nama ?? KUNCI_PENYIMPANAN,
        version: VERSI_STORE,
        storage: createJSONStorage(() => opsi.storage),

        // Sinyal OS TIDAK ikut disimpan. Ia keadaan perangkat saat ini, bukan
        // pilihan pengguna: menyimpannya berarti membawa setelan laptop kantor
        // ke ponsel pribadi lewat sinkronisasi profil browser.
        partialize: (s) => ({ pilihanPengguna: s.pilihanPengguna }),

        migrate: (tersimpan, versiLama) => {
          // Versi yang TIDAK kita kenal (lebih baru — pengguna membuka versi
          // lama aplikasi setelah memakai yang baru) dibuang, bukan ditebak.
          // Menebak bentuk masa depan adalah cara paling andal merusak
          // preferensi seseorang.
          if (versiLama > VERSI_STORE) return { pilihanPengguna: {} };
          return { pilihanPengguna: bersihkanTersimpan(tersimpan) };
        },

        // Jalur normal (versi cocok) juga divalidasi. `migrate` hanya berjalan
        // saat versinya berbeda, sehingga tanpa ini state yang disunting tangan
        // pada versi terkini akan masuk tanpa diperiksa sama sekali.
        merge: (tersimpan, saatIni) => ({
          ...saatIni,
          pilihanPengguna: bersihkanTersimpan(tersimpan),
        }),
      },
    ),
  );
}
