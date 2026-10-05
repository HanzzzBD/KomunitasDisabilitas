/** Pemetaan tertutup: parameter route tidak pernah dikirim sebagai statistik. */
const PATH: Record<string, string> = {
  Masuk: "/masuk",
  Verifikasi: "/masuk/kode",
  Onboarding: "/onboarding",
  Beranda: "/beranda",
  Cari: "/lowongan",
  Profil: "/profil",
  Cv: "/cv",
  ProfilDasar: "/profil/dasar",
  ProfilSensitif: "/profil/disabilitas",
  Karier: "/profil/karier",
  KarierForm: "/profil/karier/:id",
  CvEditor: "/cv/:id",
  CvBagian: "/cv/:id/bagian",
  LowonganDetail: "/lowongan/:id",
  Lamaran: "/lamaran",
  LamaranDetail: "/lamaran/:id",
  Notifikasi: "/notifikasi",
};
export function pathAnalitik(layar: string): string {
  return PATH[layar] ?? "/";
}
