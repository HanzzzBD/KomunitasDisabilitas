// Banner luring — AC PR-025: "Offline → banner alert; mutasi tertahan, tidak
// gagal senyap" (ADR-009: MVP online-only, SDD §4.4).
//
// Setengah AC itu sudah dipenuhi PR-025b tanpa satu piksel pun: `networkMode:
// "online"` membuat TanStack Query MENAHAN permintaan alih-alih menggagalkannya.
// Yang kurang hanyalah memberi tahu pengguna bahwa itu sedang terjadi — sebab
// penantian yang tidak dijelaskan tidak bisa dibedakan dari aplikasi yang macet.
import { useQueryClient } from "@tanstack/react-query";
import { useStatusJaringan } from "../shared/status-jaringan.js";

export function BannerLuring() {
  const { daring, periksaUlang } = useStatusJaringan();
  const queryClient = useQueryClient();

  // Dirender bersyarat, BUKAN disembunyikan dengan CSS. `role="alert"`
  // diumumkan saat elemennya MASUK ke DOM; elemen yang selalu ada lalu
  // di-`display: none` tidak pernah memicu pengumuman, dan pengguna screen
  // reader tidak akan pernah tahu koneksinya putus.
  if (daring) return null;

  const cobaLagi = () => {
    periksaUlang();
    // Melepas apa yang tertahan. `resumePausedMutations` dulu: mutasi adalah
    // niat pengguna yang sudah dinyatakan (mis. menekan "Lamar"), dan itu lebih
    // penting daripada menyegarkan tampilan.
    void queryClient.resumePausedMutations();
    void queryClient.invalidateQueries();
  };

  return (
    // `role="alert"` membawa `aria-live="assertive"` — diumumkan menyela.
    // Dipilih sadar meski asertif: kehilangan koneksi mengubah apa yang bisa
    // dilakukan pengguna SEKARANG, jadi menundanya sampai jeda bicara
    // berikutnya berarti mereka terus mencoba hal yang tidak akan berhasil.
    <div role="alert">
      {/* Bahasa sederhana: menyebut keadaan, akibatnya, lalu apa yang terjadi
          selanjutnya. Tanpa istilah teknis ("jaringan", "koneksi terputus")
          dan tanpa menyalahkan pengguna. */}
      <p>Anda sedang tidak terhubung ke internet.</p>
      <p>Perubahan yang Anda buat akan dikirim setelah terhubung kembali.</p>
      <button type="button" onClick={cobaLagi}>
        Coba lagi
      </button>
    </div>
  );
}
