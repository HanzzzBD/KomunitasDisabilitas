// Halaman "/masuk/google" — kembalian dari Google.
//
// Alamat ini SUDAH TERDAFTAR di Google Cloud Console sejak PR-025; jalurnya
// bagian dari kontrak dengan pihak luar, bukan sesuatu yang bebas dipilih.
//
// Halaman ini tidak punya isi yang bisa ditawar: pengguna tidak memintanya, ia
// hanya melewatinya. Karena itu ia melakukan satu hal dan langsung pergi —
// menukarkan `code` menjadi sesi, lalu mengantar pengguna ke tujuan awalnya.
// Yang terlihat hanyalah penanda menunggu, dan itu pun harus terumumkan: pada
// jaringan lambat penukarannya bisa memakan beberapa detik, dan layar diam
// tanpa keterangan terbaca sebagai halaman yang macet.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { googleAuth, ApiError } from "@nawasena/api-client";
import { Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks, type KunciTeks } from "../shared/i18n/index.js";
import { useKlienApi } from "../app/klien-api.js";
import { useStoreSesi } from "../shared/sesi/store.js";
import { alamatKembali, ambilTitipan } from "../features/auth/google.js";

export function MasukGoogle() {
  const t = useTeks();
  const klien = useKlienApi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const masukKeSesi = useStoreSesi((s) => s.masuk);

  const [galat, setGalat] = useState<KunciTeks | null>(null);

  // React 18 StrictMode menjalankan efek DUA KALI di pengembangan, dan
  // `code` dari Google hanya berlaku sekali pakai. Tanpa penjaga ini,
  // penukaran kedua selalu gagal dan menimpa keberhasilan yang pertama —
  // gejalanya "masuk dengan Google selalu gagal di dev, tetapi baik-baik saja
  // di produksi", yang menyesatkan ke arah yang sama sekali salah.
  const sudahJalan = useRef(false);

  useEffect(() => {
    if (sudahJalan.current) return;
    sudahJalan.current = true;

    const code = params.get("code");
    const state = params.get("state");
    const penolakan = params.get("error");

    // Pengguna menekan "Batal" di layar Google. Bukan kegagalan — jangan
    // menyapanya dengan pesan yang menuduh ada yang rusak.
    if (penolakan !== null) return setGalat("auth.google.dibatalkan");

    const titipan = ambilTitipan(state);
    if (!titipan.ok) {
      return setGalat(
        titipan.sebab === "state-tidak-cocok"
          ? "auth.google.gagalTidakCocok"
          : "auth.google.gagalKedaluwarsa",
      );
    }
    if (code === null) return setGalat("auth.google.gagalUmum");

    void (async () => {
      try {
        const { data } = await googleAuth(klien, {
          code,
          codeVerifier: titipan.verifier,
          // Harus SAMA PERSIS dengan yang dipakai saat meminta code.
          redirectUri: alamatKembali(window.location.origin),
          client: "web",
        });
        masukKeSesi(data.accessToken);
        navigate(titipan.tujuan, { replace: true });
      } catch (kegagalan) {
        // Kode server dibedakan hanya jika saran tindakannya berbeda. Untuk
        // pengguna, "code sudah dipakai" dan "code tidak sah" bermuara pada
        // satu hal yang sama: ulangi dari halaman masuk.
        setGalat(
          kegagalan instanceof ApiError && kegagalan.code === "GOOGLE_EXCHANGE_GAGAL"
            ? "auth.google.gagalKedaluwarsa"
            : "auth.google.gagalUmum",
        );
      }
    })();
  }, [klien, masukKeSesi, navigate, params]);

  if (galat !== null) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
        <h1 className="text-2xl font-semibold">{t("auth.google.judulGagal")}</h1>
        {/* `role="alert"`: pengguna mendarat di halaman ini tanpa memintanya,
            jadi ia tidak sedang membaca apa pun yang layak dilindungi dari
            penyelaan — dan kegagalannya menentukan apa yang harus ia lakukan
            berikutnya. */}
        <p role="alert" className="text-base text-gray-900">
          {t(galat)}
        </p>
        <Tombol onClick={() => navigate("/masuk", { replace: true })}>
          {t("auth.google.kembali")}
        </Tombol>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <WilayahMemuat memuat label={t("auth.google.sedangMemeriksa")}>
        {null}
      </WilayahMemuat>
    </main>
  );
}
