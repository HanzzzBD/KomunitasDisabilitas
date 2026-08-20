// Langkah 2 — persetujuan penggunaan data ragam disabilitas (PR-035).
//
// LAYAR TERPISAH DARI PILIHANNYA, dan itu tuntutan Security Considerations
// ticket ini (UU PDP): persetujuan yang ditumpuk di bawah pertanyaannya
// dicentang sambil lalu oleh orang yang sedang memikirkan pertanyaannya, bukan
// memikirkan izinnya.
//
// TIDAK PERNAH PRE-CHECKED. Kotak yang sudah tercentang saat layarnya muncul
// bukan persetujuan — ia asumsi yang harus dibatalkan pengguna, dan UU PDP
// menuntut yang sebaliknya.
//
// TIDAK MENGHALANGI SIAPA PUN. Menolak (atau melewati) langkah ini tidak
// menutup satu pun langkah berikutnya. Dan karena data ragam disabilitas tidak
// pernah dikirim ke mana pun di PR ini — pada JALUR MANA PUN, disetujui atau
// tidak (PR-037 belum ada) — persetujuan di sini adalah izin untuk MASA DEPAN,
// bukan pemicu pengiriman hari ini. Teksnya menyatakan itu apa adanya.
import { KotakCentang } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";

export interface LangkahPersetujuanProps {
  setuju: boolean;
  onUbah: (setuju: boolean) => void;
  /** Hanya untuk kalimat konteks ("Anda memilih N hal"). Nilainya tidak dikirim. */
  jumlahDipilih: number;
}

export function LangkahPersetujuan({ setuju, onUbah, jumlahDipilih }: LangkahPersetujuanProps) {
  const t = useTeks();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-gray-900">{t("onboarding.persetujuan.penjelasan")}</p>

      <ul className="flex list-disc flex-col gap-2 pl-6 text-base text-gray-900">
        <li>{t("onboarding.persetujuan.butir.belumDikirim")}</li>
        <li>{t("onboarding.persetujuan.butir.tidakTersimpan")}</li>
        <li>{t("onboarding.persetujuan.butir.takWajib")}</li>
      </ul>

      <KotakCentang
        label={t("onboarding.persetujuan.kotak")}
        bantuan={t("onboarding.persetujuan.kotakBantuan")}
        dicentang={setuju}
        onUbah={onUbah}
      />

      <p className="text-sm text-gray-700">
        {jumlahDipilih === 0
          ? t("onboarding.persetujuan.belumMemilih")
          : t("onboarding.persetujuan.sudahMemilih", { jumlah: jumlahDipilih })}
      </p>
    </div>
  );
}
