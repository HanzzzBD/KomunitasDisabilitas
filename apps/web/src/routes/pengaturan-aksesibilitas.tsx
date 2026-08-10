// Panel "/pengaturan/aksesibilitas" — Scope PR-033: "Slot panel aksesibilitas
// (diisi PR-036)".
//
// SLOT, DAN DIKATAKAN APA ADANYA. Panel ini belum punya satu pun kendali, dan
// halaman yang menyembunyikan kenyataan itu — dengan tombol mati, atau dengan
// diam — membuat pengguna mengira aplikasinya rusak. `KeadaanKosong` (PR-032b)
// ada persis untuk ini: menyebut apa yang tidak ada, lalu menjelaskan sebabnya.
//
// KALIMAT KEDUANYA YANG PALING PENTING. Preferensi aksesibilitas SUDAH bekerja
// sejak PR-026 — aplikasi mengikuti `prefers-reduced-motion` dan kontras dari
// setelan perangkat. Slot yang hanya berkata "belum tersedia" akan membuat
// pengguna yang sudah menyetel perangkatnya menyangka setelannya diabaikan,
// lalu berhenti memakainya.
import { KeadaanKosong } from "@nawasena/ui";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";

export function PengaturanAksesibilitas() {
  const t = useTeks();

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("pengaturan.aksesibilitas.judul") }));

  return (
    <section aria-labelledby="aksesibilitas-judul" className="flex flex-col gap-4">
      <h2 id="aksesibilitas-judul" className="text-2xl font-semibold text-gray-900">
        {t("pengaturan.aksesibilitas.judul")}
      </h2>
      <p className="text-base text-gray-900">{t("pengaturan.aksesibilitas.penjelasan")}</p>

      {/* Tingkat 3: bersarang di bawah <h2> di atasnya, yang bersarang di bawah
          <h1> "Pengaturan" milik kerangka. Tingkatnya diminta di tempat
          pemakaian justru supaya tidak ada komponen yang menebaknya. */}
      <KeadaanKosong judul={t("pengaturan.aksesibilitas.slot.judul")} tingkatJudul={3}>
        <p>{t("pengaturan.aksesibilitas.slot.penjelasan")}</p>
      </KeadaanKosong>
    </section>
  );
}
