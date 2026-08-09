// Tab — AC PR-028 nomor 3: "Tabs keyboard sesuai pola WAI-ARIA".
//
// DI ATAS RADIX. Pola tab menuntut perilaku yang saling terkait dan tidak punya
// padanan natif: roving tabindex (hanya satu tab yang masuk urutan Tab, panah
// berpindah di antaranya), Home/End, orientasi yang menentukan panah mana yang
// berlaku, dan penyambungan dua arah antara tab dan panelnya. Menulis ulang itu
// persis yang diperingatkan PRD R9.
//
// API-nya digerakkan DATA (`daftar`), bukan komponen anak, dan itu keputusan
// aksesibilitas — bukan selera. Dua cacat paling lazim pada tab adalah tab yang
// `aria-controls`-nya menunjuk panel yang tidak ada, dan panel yang tidak
// dimiliki tab mana pun. Keduanya lahir dari menuliskan tab dan panel di dua
// tempat terpisah lalu salah satunya berubah. Dengan satu larik, keduanya
// mustahil.
import type { ReactNode } from "react";
import * as RadixTabs from "@radix-ui/react-tabs";
import { gabungKelas } from "./gabung-kelas.js";

export interface ItemTab {
  nilai: string;
  label: ReactNode;
  isi: ReactNode;
  nonaktif?: boolean;
}

export interface TabProps {
  daftar: ItemTab[];
  /**
   * Nama daftar tab, mis. "Bagian lamaran". WAJIB.
   *
   * Screen reader membacakannya sebelum "tab 1 dari 3". Tanpa nama, pengguna
   * hanya mendengar posisinya — tahu ada tiga hal, tidak tahu tiga hal apa.
   */
  label: string;
  nilai?: string;
  nilaiAwal?: string;
  onUbah?: (nilai: string) => void;
  orientasi?: "horizontal" | "vertikal";
  /**
   * Kapan tab menjadi aktif saat dijelajahi panah.
   *
   * BAWAANNYA `"manual"` — Enter/Spasi yang mengaktifkan — sedangkan bawaan
   * Radix `"otomatis"`. Perbedaannya bukan gaya: Radix MELEPAS panel yang tidak
   * aktif dari DOM, jadi dengan aktivasi otomatis, menekan panah dari tab 1 ke
   * tab 3 memasang lalu membongkar panel 2 di tengah jalan — beserta seluruh
   * permintaan data yang dijalankannya. WAI-ARIA APG memang menganjurkan
   * otomatis, tetapi dengan syarat panelnya tampil "tanpa jeda yang terasa";
   * di aplikasi ini isi tab datang dari jaringan, jadi syarat itu tidak
   * terpenuhi. Pakai `"otomatis"` bila isinya benar-benar statis.
   */
  aktivasi?: "manual" | "otomatis";
  className?: string;
}

export function Tab({
  daftar,
  label,
  nilai,
  nilaiAwal,
  onUbah,
  orientasi = "horizontal",
  aktivasi = "manual",
  className,
}: TabProps) {
  const tegak = orientasi === "vertikal";

  return (
    <RadixTabs.Root
      value={nilai}
      defaultValue={nilaiAwal ?? daftar[0]?.nilai}
      onValueChange={onUbah}
      orientation={tegak ? "vertical" : "horizontal"}
      activationMode={aktivasi === "manual" ? "manual" : "automatic"}
      className={gabungKelas(tegak ? "flex gap-4" : "flex flex-col gap-4", className)}
    >
      <RadixTabs.List
        aria-label={label}
        className={gabungKelas(
          "flex gap-1",
          tegak ? "flex-col border-r border-gray-300 pr-2" : "border-b border-gray-300",
        )}
      >
        {daftar.map((t) => (
          <RadixTabs.Trigger
            key={t.nilai}
            value={t.nilai}
            disabled={t.nonaktif}
            className={gabungKelas(
              "min-h-sentuh px-4 py-2 text-base",
              "inline-flex items-center justify-center gap-2",
              // Tidak ada `outline-none`, sama seperti seluruh komponen lain:
              // outline `:focus-visible` global (PR-027a) yang bekerja. Pada
              // aktivasi manual ia justru KUNCI — ia satu-satunya yang
              // membedakan "tab yang sedang disorot" dari "tab yang aktif".
              "text-gray-700 hover:bg-gray-100",
              // Keadaan aktif ditandai GARIS dan KETEBALAN, bukan warna saja.
              // Penanda yang hanya berupa warna gagal WCAG 2.2 §1.4.1 dan
              // hilang sama sekali di mode kontras tinggi.
              tegak ? "border-r-2 -mr-2.5" : "border-b-2 -mb-px",
              // Garis transparan sejak awal supaya tab tidak bergeser saat
              // dipilih — pergeseran tata letak di bawah kursor adalah cara
              // mudah membuat pengguna kehilangan tempatnya.
              "border-transparent",
              "data-[state=active]:border-gray-900 data-[state=active]:font-semibold",
              "data-[state=active]:text-gray-900",
              "transition-colors gerak-minimal:transition-none",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {t.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>

      {daftar.map((t) => (
        // Radix memberi setiap panel `tabIndex=0`. Itu disengaja dan perlu:
        // panel yang isinya tidak punya satu pun elemen fokusable tetap harus
        // bisa dicapai keyboard, kalau tidak isinya mustahil dibaca dengan
        // penjelajahan Tab.
        <RadixTabs.Content key={t.nilai} value={t.nilai} className="text-base text-gray-900">
          {t.isi}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
