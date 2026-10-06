export type NamaIkon =
  | "beranda"
  | "lowongan"
  | "lamaran"
  | "cv"
  | "profil"
  | "aksesibilitas"
  | "bantuan"
  | "notifikasi";

const PATH: Record<NamaIkon, string> = {
  beranda: "m3 10 9-7 9 7v10H3Zm6 10v-7h6v7",
  lowongan: "M3 7h18v13H3ZM8 7V3h8v4M3 12h18M10 12v3h4v-3",
  lamaran: "M5 3h14v18H5ZM8 7h8M8 11h8m-8 5 2 2 5-5",
  cv: "M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8M8 16h8",
  profil: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3",
  aksesibilitas: "M14 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM3 8l9 2 9-2M12 10v5m0 0-5 7m5-7 5 7",
  bantuan: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9 8a3 3 0 0 1 6 0c0 2-3 2-3 3-5m-3 8v1",
  notifikasi: "M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 20h4M12 2v2",
};

export function IkonNavigasi({ nama }: { nama: NamaIkon }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATH[nama]} />
    </svg>
  );
}
