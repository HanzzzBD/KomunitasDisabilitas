// Pilihan (Select) — AC PR-027 nomor 5: keyboard sesuai pola WAI-ARIA.
//
// INI yang memang butuh Radix. Berbeda dari Tombol dan Masukan (PR-027b), pola
// listbox tidak punya elemen natif yang bisa ditata tampilannya: `<option>`
// bawaan tidak menerima gaya, sementara pola ARIA-nya menuntut belasan perilaku
// yang saling terkait — roving focus, typeahead, Home/End, penguncian scroll,
// pengembalian fokus saat tutup, penutupan saat klik di luar. Menulis ulang
// itu persis yang diperingatkan PRD R9 ("pakai komponen headless teruji, bukan
// bangun dari nol").
//
// PERILAKU DATANG SEPENUHNYA DARI RADIX; berkas ini hanya menata tampilan dan
// menyambungkannya ke KolomForm. Itu mitigasi Risks PR-027 apa adanya:
// styling-only di atas primitive.
import { forwardRef } from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { gabungKelas } from "./gabung-kelas.js";
import { useKonteksKolom } from "./konteks-kolom.js";

export interface OpsiPilihan {
  nilai: string;
  label: string;
  nonaktif?: boolean;
}

export interface PilihanProps {
  opsi: OpsiPilihan[];
  nilai?: string;
  nilaiAwal?: string;
  onUbah?: (nilai: string) => void;
  /** Teks saat belum ada yang dipilih. */
  placeholder?: string;
  nonaktif?: boolean;
  /** Bila kosong, diambil dari KolomForm. */
  bermasalah?: boolean;
  id?: string;
  nama?: string;
  "aria-label"?: string;
  className?: string;
}

export const Pilihan = forwardRef<HTMLButtonElement, PilihanProps>(function Pilihan(
  {
    opsi,
    nilai,
    nilaiAwal,
    onUbah,
    placeholder = "Pilih salah satu",
    nonaktif = false,
    bermasalah,
    id,
    nama,
    "aria-label": ariaLabel,
    className,
  },
  ref,
) {
  const kolom = useKonteksKolom();
  const salah = bermasalah ?? kolom?.bermasalah ?? false;

  return (
    <RadixSelect.Root
      value={nilai}
      defaultValue={nilaiAwal}
      onValueChange={onUbah}
      disabled={nonaktif}
      name={nama}
      required={kolom?.wajib}
    >
      <RadixSelect.Trigger
        ref={ref}
        id={id ?? kolom?.id}
        aria-label={ariaLabel}
        aria-describedby={kolom?.describedBy}
        aria-invalid={salah || undefined}
        className={gabungKelas(
          // Target sentuh sama dengan kontrol lain — pemicu select termasuk
          // sasaran yang paling sering meleset karena ia sempit dan tinggi.
          "min-h-sentuh w-full rounded px-3 py-2 text-base",
          "flex items-center justify-between gap-2",
          "border bg-white text-gray-900",
          // Tidak ada `outline-none`, sama seperti PR-027b: outline
          // `:focus-visible` global yang bekerja. Dijaga test.
          salah ? "border-red-700" : "border-gray-400",
          "disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-70",
          "data-[placeholder]:text-gray-500",
          className,
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        {/* Ikon murni hiasan: keadaan buka/tutup sudah diumumkan lewat
            `aria-expanded` yang ditulis Radix. Membiarkannya terbaca hanya
            menambah kebisingan bagi pengguna screen reader. */}
        <RadixSelect.Icon aria-hidden="true">▾</RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          // `position="popper"` memposisikan daftar DI BAWAH pemicu alih-alih
          // menimpanya. Mode bawaan Radix menyelaraskan item terpilih tepat di
          // atas pemicu, yang pada zoom 200% (WCAG 2.2 §1.4.4) mudah terdorong
          // keluar layar.
          position="popper"
          sideOffset={4}
          className={gabungKelas(
            "z-50 max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-hidden",
            "rounded border border-gray-400 bg-white shadow-lg",
          )}
        >
          <RadixSelect.Viewport className="p-1">
            {opsi.map((o) => (
              <RadixSelect.Item
                key={o.nilai}
                value={o.nilai}
                disabled={o.nonaktif}
                className={gabungKelas(
                  "min-h-sentuh flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-base",
                  // `data-highlighted` adalah item yang sedang disorot keyboard
                  // MAUPUN tetikus — satu penanda untuk keduanya, jadi jalur
                  // keyboard tidak bisa diam-diam kehilangan sorotannya.
                  //
                  // Sorotannya membalik warna (17,4:1), BUKAN sekadar latar abu
                  // muda. Contoh Radix di internet lazim memakai `bg-*-100`
                  // berpasangan dengan `outline-none` — abu muda di atas putih
                  // hanya ± 1,1:1, jauh di bawah 3:1 yang dituntut WCAG 2.2
                  // §1.4.11, jadi begitu outline-nya dimatikan penanda fokusnya
                  // praktis hilang. Outline di sini sengaja dibiarkan hidup.
                  "data-[highlighted]:bg-gray-900 data-[highlighted]:text-white",
                  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60",
                )}
              >
                {/* Tanda centang, BUKAN warna saja. Keadaan terpilih yang hanya
                    dibedakan warna gagal WCAG 2.2 §1.4.1 (jangan bergantung
                    pada warna) dan hilang sama sekali di mode kontras tinggi. */}
                <RadixSelect.ItemIndicator aria-hidden="true">✓</RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
});
