// Mapper riwayat status → lini masa (PR-079, Testing Checklist "Unit Test
// (mapper timeline)"). Fungsi murni, tanpa React.
//
// SATU TITIK AWAL YANG TIDAK ADA DI DATA. `statusHistory` hanya mencatat
// PERPINDAHAN (`from → to`); pengiriman lamaran sendiri bukan perpindahan,
// jadi riwayat lamaran yang baru dikirim adalah larik KOSONG. Lini masa yang
// dibacakan screen reader harus tetap dimulai dari "Lamaran dikirim" — kalau
// tidak, lamaran yang belum disentuh siapa pun tampil tanpa riwayat sama
// sekali, dan kronologinya terbaca dimulai dari tengah.
//
// URUTAN KRONOLOGIS (terlama dulu) — AC "Timeline = ordered list semantik (SR
// membaca kronologi benar)": `<ol>` yang dibaca dari atas ke bawah harus sama
// dengan urutan kejadiannya. Server sudah mengirimnya terlama dulu; diurutkan
// ulang di sini (stabil) supaya kebenaran urutan tidak bergantung pada janji itu.
import type { ApplicationStatus, MyApplicationDetail } from "@nawasena/schemas";

export interface EntriLiniMasa {
  /** `null` = titik awal "Lamaran dikirim". */
  status: ApplicationStatus | null;
  at: string;
  oleh: "seeker" | "admin" | null;
  terbaru: boolean;
}

export function petakanLiniMasa(
  lamaran: Pick<MyApplicationDetail, "appliedAt" | "statusHistory">,
): EntriLiniMasa[] {
  const perpindahan = lamaran.statusHistory
    .map((e, urutan) => ({ e, urutan }))
    .sort((a, b) => a.e.at.localeCompare(b.e.at) || a.urutan - b.urutan)
    .map(({ e }) => ({ status: e.to, at: e.at, oleh: e.by, terbaru: false }) as EntriLiniMasa);

  const semua: EntriLiniMasa[] = [
    { status: null, at: lamaran.appliedAt, oleh: null, terbaru: false },
    ...perpindahan,
  ];
  const akhir = semua.at(-1);
  if (akhir !== undefined) akhir.terbaru = true;
  return semua;
}
