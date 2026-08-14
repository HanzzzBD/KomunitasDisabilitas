// Toast — AC PR-028 nomor 2: "diumumkan `aria-live="polite"` tanpa mencuri
// fokus".
//
// DUA TUNTUTAN ITU SALING BERLAWANAN, dan di situlah seluruh kesulitannya.
// Supaya pengguna screen reader TAHU sesuatu terjadi, pesannya harus masuk ke
// live region. Supaya ia tidak kehilangan tempatnya, fokus tidak boleh pindah.
// Cara paling sering dipakai untuk memenuhi yang pertama — memindahkan fokus ke
// toast — justru melanggar yang kedua: pengguna terlempar dari tempat ia
// bekerja, dan setelah toast hilang ia tidak punya jalan kembali.
//
// DI ATAS RADIX, dan alasannya bukan sekadar SDD §197. Satu bagian dari ini
// tidak bisa ditulis ulang dengan benar tanpa mengulang kesalahan yang sama:
// live region hanya mengumumkan PERUBAHAN di dalam region yang SUDAH ADA. Toast
// yang dirender sebagai `{pesan && <div aria-live="polite">{pesan}</div>}`
// membuat region-nya lahir bersamaan dengan isinya — dan screen reader kerap
// tidak mengumumkan apa pun. Radix menghindarinya dengan menyalin teks toast ke
// region tersembunyi yang terpisah dari toast yang terlihat, lalu membuang
// salinan itu setelah satu detik supaya ia tidak terbaca dua kali saat pengguna
// menjelajah halaman.
import type { ReactNode } from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { gabungKelas } from "./gabung-kelas.js";
import { Tombol } from "./tombol.js";

/**
 * Aksi opsional di dalam toast (mis. "Urungkan").
 *
 * `alternatif` WAJIB, dan itu tuntutan Radix yang kebetulan benar. Toast hilang
 * sendiri; pengguna screen reader yang mendengar "Urungkan" belum tentu sempat
 * menjangkaunya. Teks ini yang ikut diumumkan menggantikan tombolnya, jadi ia
 * harus menjelaskan cara mencapai hal yang sama TANPA toast — bukan mengulang
 * nama tombolnya.
 */
export interface AksiToast {
  label: string;
  onKlik: () => void;
  /** Cara mencapai hal yang sama tanpa toast, mis. "Buka Lamaran Saya untuk mengurungkan". */
  alternatif: string;
}

export interface PenyediaToastProps {
  children: ReactNode;
}

/**
 * Dipasang SEKALI membungkus aplikasi. Menyediakan region tempat toast muncul.
 */
export function PenyediaToast({ children }: PenyediaToastProps) {
  return (
    <RadixToast.Provider
      // Kata pembuka yang diumumkan sebelum isi toast. Bawaan Radix
      // "Notification" — bahasa Inggris di tengah kalimat Indonesia membuat
      // screen reader berbahasa Indonesia melafalkannya salah.
      label="Pemberitahuan"
      // 8 detik, bukan 5 detik bawaan Radix. Pesan dua baris dalam Bahasa
      // Indonesia sederhana butuh lebih lama untuk dibaca — apalagi oleh
      // pengguna yang memperbesar teks dan hanya melihat sebagian layar.
      // Radix menghentikan hitungannya saat toast disentuh tetikus ATAU
      // menerima fokus, jadi angka ini batas bawah, bukan batas keras.
      duration={8000}
      swipeDirection="right"
    >
      {children}

      <RadixToast.Viewport
        // "(F8)" bukan hiasan: Radix mendaftarkan F8 sebagai pintasan yang
        // MEMINDAHKAN fokus ke daftar toast. Tanpa itu, toast yang muncul di
        // ujung DOM praktis tidak terjangkau keyboard — dan tombol di dalamnya
        // menjadi hiasan bagi pengguna yang tidak memakai tetikus (persona
        // Sari). Labelnya menyebut pintasannya supaya ia bisa ditemukan.
        label="Pemberitahuan ({hotkey})"
        className={gabungKelas(
          "fixed bottom-0 right-0 z-50 m-0 flex list-none flex-col gap-2 p-4",
          // `max-h-screen`: pada zoom 200% (WCAG 2.2 §1.4.4) tumpukan toast
          // bisa lebih tinggi dari layar. Tanpa batas ini yang paling atas
          // terdorong keluar dan tidak bisa diraih sama sekali.
          "max-h-screen w-full sm:max-w-md",
        )}
      />
    </RadixToast.Provider>
  );
}

export interface ToastProps {
  /** Pesan utama. WAJIB — toast tanpa judul tidak punya apa pun untuk diumumkan. */
  judul: ReactNode;
  terbuka?: boolean;
  onUbahTerbuka?: (terbuka: boolean) => void;
  /** Penjelasan tambahan, diumumkan sesudah judul. */
  deskripsi?: ReactNode;
  aksi?: AksiToast;
  /**
   * Menyela pembacaan yang sedang berjalan (`aria-live="assertive"`).
   *
   * HANYA untuk hal yang rugi bila terlambat diketahui — sesi berakhir,
   * pengiriman gagal. Menyela adalah biaya: pengguna screen reader kehilangan
   * kalimat yang sedang ia dengar. Karena itu bawaannya `polite`.
   */
  mendesak?: boolean;
  labelTutup?: string;
  className?: string;
}

export function Toast({
  judul,
  terbuka,
  onUbahTerbuka,
  deskripsi,
  aksi,
  mendesak = false,
  labelTutup = "Tutup",
  className,
}: ToastProps) {
  return (
    <RadixToast.Root
      open={terbuka}
      onOpenChange={onUbahTerbuka}
      // PENERJEMAHAN YANG MUDAH TERBALIK. Nama prop Radix bercerita tentang
      // ASAL pesan, bukan cara mengumumkannya: "foreground" (bawaannya!)
      // menjadi `aria-live="assertive"`, "background" menjadi `polite`.
      // Membiarkan bawaan Radix berarti SETIAP toast menyela — persis kebalikan
      // dari AC. Dijaga test.
      type={mendesak ? "foreground" : "background"}
      // TOAST BERAKSI TIDAK PERNAH HILANG SENDIRI.
      //
      // Menghilangkan tombol setelah hitungan mundur berarti fungsinya lenyap
      // karena waktu — WCAG 2.2 §2.2.1 (Timing Adjustable). Yang paling
      // dirugikan justru yang paling lambat menjangkaunya: pengguna keyboard
      // yang harus menekan F8 dulu, dan pengguna screen reader yang baru
      // mendengar tawarannya setelah kalimat sebelumnya selesai.
      //
      // Aturannya struktural, bukan anjuran: kehadiran `aksi` yang mematikan
      // hitungan, sehingga tidak ada pemakaian yang bisa lupa.
      duration={aksi != null ? Infinity : undefined}
      className={gabungKelas(
        "flex items-start justify-between gap-3 rounded-lg border p-4 shadow-lg",
        "border-gray-400 bg-white text-gray-900",
        // TIDAK ADA ANIMASI, dan itu keputusan. Toast lazim ditulis meluncur
        // masuk dari tepi layar; gerak di sudut penglihatan justru yang paling
        // sering memicu mual pada gangguan vestibular, dan menarik perhatian
        // menjauh dari pekerjaan bagi persona Dimas. Toast yang langsung ada
        // tidak kehilangan apa pun — pengumumannya datang dari live region,
        // bukan dari geraknya.
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <RadixToast.Title className="text-base font-semibold">{judul}</RadixToast.Title>
        {deskripsi != null && (
          <RadixToast.Description className="text-sm text-gray-700">
            {deskripsi}
          </RadixToast.Description>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {aksi != null && (
          <RadixToast.Action altText={aksi.alternatif} asChild>
            <Tombol varian="sekunder" ukuran="kecil" onClick={aksi.onKlik}>
              {aksi.label}
            </Tombol>
          </RadixToast.Action>
        )}

        <RadixToast.Close asChild>
          {/* Penutup manual WAJIB ADA, bukan pelengkap. Radix memberi toast
              gerakan geser-untuk-menutup, dan WCAG 2.2 §2.5.7 (Dragging
              Movements) menuntut setiap fungsi berbasis seret punya jalan lain
              dengan satu penunjuk. Tombol inilah jalan itu — sekaligus
              satu-satunya cara menutup bagi toast beraksi yang tidak
              berhitung mundur. */}
          <Tombol varian="hening" ukuran="kecil" aria-label={labelTutup}>
            <span aria-hidden="true">×</span>
          </Tombol>
        </RadixToast.Close>
      </div>
    </RadixToast.Root>
  );
}
