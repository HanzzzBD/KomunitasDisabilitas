// Sakelar operasional wizard onboarding (PR-035) — Rollback Strategy ticket:
// "wizard dapat di-bypass via flag (fallback ke defaults)".
//
// SATU FUNGSI, DIPAKAI DUA TEMPAT, dan penyatuannya bukan kerapian melainkan
// syarat kebenaran. Sakelarnya harus diperiksa di DUA titik:
//
//   1. `app/tata-letak.tsx` — supaya tidak ada seorang pun DIKIRIM ke wizard;
//   2. `routes/onboarding.tsx` — supaya yang mengetik alamatnya langsung pun
//      tidak menjalankan satu baris logika wizard.
//
// Dua pemeriksaan yang masing-masing menuliskan sendiri nama env var-nya adalah
// dua pemeriksaan yang suatu saat menyebut nama berbeda — dan hasilnya adalah
// rollback yang setengah berlaku: tidak ada yang dialihkan ke sana, tetapi
// alamatnya masih menjalankan wizard. Karena itu nama variabelnya hanya ditulis
// SEKALI, di berkas ini.
//
// TANPA pustaka feature-flag. Presedennya `features/auth/google.ts`, yang
// membaca `import.meta.env` langsung untuk keputusan yang sama bentuknya.
// `import.meta.env` dipanggang saat build: nilainya tidak berubah di tengah
// jalannya satu build, sehingga kedua titik pemeriksaan selalu sepakat.

/**
 * Wizard aktif? BAWAANNYA YA.
 *
 * Polaritasnya penting: yang mematikan harus MENYATAKANNYA (`"false"`), bukan
 * yang menghidupkan. Bendera yang mati kecuali dinyalakan adalah fitur yang
 * diam-diam tidak pernah tayang di lingkungan yang lupa menyetelnya — dan
 * ketiadaannya tidak menimbulkan satu pun gejala.
 */
export function wizardOnboardingAktif(): boolean {
  return import.meta.env.VITE_ONBOARDING_WIZARD_ENABLED !== "false";
}
