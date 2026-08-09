// Halaman "/masuk" — AC PR-030 nomor 1 (login OTP) dan 4 (galat diumumkan).
//
// DUA LANGKAH DALAM SATU HALAMAN, bukan dua alamat. Pindah halaman di tengah
// alur berarti fokus keyboard kembali ke awal dokumen dan pengguna screen
// reader mendengar seluruh kerangka halaman diulang sebelum sampai ke kotak
// isian. Di sini yang berganti hanya isi form-nya, dan fokus dipindahkan
// tepat ke tempat yang harus diisi berikutnya.
//
// Jalur URL-nya sudah pasti sejak PR-025: `/masuk/google` adalah redirect URI
// yang terdaftar di Google Cloud Console.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { KolomForm, Masukan, Tombol } from "@nawasena/ui";
import { requestOtp, verifyOtp } from "@nawasena/api-client";
import { useTeks } from "../shared/i18n/index.js";
import { useKlienApi } from "../app/klien-api.js";
import { useStoreSesi } from "../shared/sesi/store.js";
import { bacaTujuan } from "../shared/rute/tujuan.js";
import { normalkanNomor } from "../features/auth/nomor-hp.js";
import { pesanGalat } from "../features/auth/pesan-galat.js";
import { clientIdGoogle, siapkanMasukGoogle } from "../features/auth/google.js";

type Langkah = "nomor" | "kode";

export function Masuk() {
  const t = useTeks();
  const klien = useKlienApi();
  const navigate = useNavigate();
  const lokasi = useLocation();
  const masukKeSesi = useStoreSesi((s) => s.masuk);

  const [langkah, setLangkah] = useState<Langkah>("nomor");
  const [nomor, setNomor] = useState("");
  const [nomorE164, setNomorE164] = useState("");
  const [kode, setKode] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [sisaDetik, setSisaDetik] = useState(0);
  const [kabar, setKabar] = useState("");

  const kotakKode = useRef<HTMLInputElement>(null);

  // Fokus mengikuti langkah. Tanpa ini, tombol "Kirim kode" yang dilepas dari
  // DOM membawa fokus bersamanya dan pengguna keyboard mendarat di awal
  // dokumen — harus menyusuri seluruh halaman lagi untuk menemukan kotak yang
  // baru muncul. Bagi pengguna screen reader, langkah barunya bahkan tidak
  // terumumkan sama sekali.
  useEffect(() => {
    if (langkah === "kode") kotakKode.current?.focus();
  }, [langkah]);

  // Fokus kembali ke kotak kode SETELAH galat, dan setelah kotaknya hidup lagi.
  //
  // Ditulis sebagai efek, bukan sebagai `focus()` di dalam `catch`, karena di
  // sana kotaknya masih `disabled` — `sibuk` baru turun di blok `finally`, dan
  // pembaruan state React tidak menyentuh DOM di tengah handler. Elemen yang
  // sedang nonaktif menolak fokus tanpa bersuara, jadi versi pertama gagal
  // dalam diam: pengguna keyboard tetap terdampar setelah salah kode.
  useEffect(() => {
    if (langkah === "kode" && galat !== null && !sibuk) kotakKode.current?.focus();
  }, [galat, langkah, sibuk]);

  // Hitung mundur "kirim ulang". Ditulis sebagai satu interval yang mati
  // bersama komponen — interval yang lolos akan terus berjalan di latar dan
  // memanggil `setState` atas komponen yang sudah tidak ada.
  useEffect(() => {
    if (sisaDetik <= 0) return;
    const jam = setInterval(() => setSisaDetik((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(jam);
  }, [sisaDetik]);

  // Saat hitungan HABIS, umumkan SEKALI.
  //
  // Angka detiknya sendiri sengaja TIDAK berada di dalam live region: region
  // yang isinya berubah tiap detik membuat screen reader membacakan hitungan
  // mundur tanpa henti dan menenggelamkan segalanya. Yang berguna bagi
  // pengguna bukan angkanya, melainkan satu kalimat saat ia boleh mencoba lagi.
  const pernahMundur = useRef(false);
  useEffect(() => {
    if (sisaDetik > 0) pernahMundur.current = true;
    else if (pernahMundur.current) {
      pernahMundur.current = false;
      setKabar(t("auth.kode.bisaKirimUlang"));
    }
  }, [sisaDetik, t]);

  async function kirimKode(e164: string, { ulang }: { ulang: boolean }) {
    setGalat(null);
    setSibuk(true);
    try {
      const { data } = await requestOtp(klien, { phone: e164 });
      setNomorE164(e164);
      setLangkah("kode");
      setSisaDetik(data.retryAfterSeconds);
      if (ulang) setKabar(t("auth.kode.terkirim"));
    } catch (kegagalan) {
      setGalat(pesanGalat(kegagalan, t));
    } finally {
      setSibuk(false);
    }
  }

  async function mulaiGoogle() {
    const clientId = clientIdGoogle();
    if (clientId === null) return;
    setGalat(null);
    setSibuk(true);
    try {
      const alamat = await siapkanMasukGoogle({
        clientId,
        asal: window.location.origin,
        // Tujuan awal DITITIPKAN menyeberangi pengalihan: sesudah kembali dari
        // Google, query di alamat kembalian milik Google, bukan milik kita —
        // `?tujuan=` yang tadi ada di URL sudah tidak ada di mana pun.
        tujuan: bacaTujuan(lokasi.search),
      });
      window.location.assign(alamat);
    } catch {
      // Menyiapkan PKCE bisa gagal di konteks tidak aman: `crypto.subtle` hanya
      // tersedia di HTTPS dan localhost. Jalur OTP tetap terbuka, jadi
      // halamannya tidak boleh berhenti — cukup katakan yang ini tidak jadi.
      setGalat(t("auth.google.gagalUmum"));
      setSibuk(false);
    }
  }

  function kirimNomor(e: React.FormEvent) {
    e.preventDefault();
    const e164 = normalkanNomor(nomor);
    if (nomor.trim() === "") return setGalat(t("auth.nomor.kosong"));
    if (e164 === null) return setGalat(t("auth.nomor.takValid"));
    void kirimKode(e164, { ulang: false });
  }

  async function kirimKodeVerifikasi(e: React.FormEvent) {
    e.preventDefault();
    if (kode.trim() === "") return setGalat(t("auth.kode.kosong"));
    if (!/^\d{6}$/.test(kode)) return setGalat(t("auth.kode.takValid"));

    setGalat(null);
    setSibuk(true);
    try {
      const { data } = await verifyOtp(klien, {
        phone: nomorE164,
        code: kode,
        client: "web",
      });
      masukKeSesi(data.accessToken);
      // `replace`: halaman masuk tidak boleh tertinggal di riwayat, kalau tidak
      // tombol kembali mengembalikan pengguna ke form yang sudah selesai.
      navigate(bacaTujuan(lokasi.search), { replace: true });
    } catch (kegagalan) {
      setGalat(pesanGalat(kegagalan, t));
    } finally {
      setSibuk(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("auth.judul")}</h1>
        <p className="text-base text-gray-700">{t("auth.penjelasan")}</p>
      </div>

      {/*
        Kabar yang TIDAK menuntut tindakan (kode terkirim, boleh kirim ulang).
        Dipisah dari galat: galat memakai `role="alert"` milik KolomForm yang
        menyela, sedangkan kabar ini sopan dan menunggu giliran.
      */}
      <p role="status" className="sr-only">
        {kabar}
      </p>

      {langkah === "nomor" ? (
        <form onSubmit={kirimNomor} noValidate className="flex flex-col gap-4">
          <KolomForm
            label={t("auth.nomor.label")}
            bantuan={t("auth.nomor.bantuan")}
            galat={galat}
            wajib
          >
            <Masukan
              type="tel"
              // `autocomplete="tel"` supaya nomor yang sudah tersimpan di
              // peramban bisa diisikan sekali ketuk — paling berarti bagi
              // pengguna yang mengetik dengan susah payah.
              autoComplete="tel"
              inputMode="tel"
              value={nomor}
              onChange={(e) => setNomor(e.target.value)}
              disabled={sibuk}
            />
          </KolomForm>

          <Tombol type="submit" disabled={sibuk}>
            {sibuk ? t("auth.nomor.mengirim") : t("auth.nomor.kirim")}
          </Tombol>

          {/*
            Tombol Google hanya muncul bila client ID-nya ADA. Tombol yang pasti
            gagal lebih buruk daripada tidak ada sama sekali: pengguna mengira
            dirinya yang salah, mencoba berulang, lalu menyerah — padahal jalur
            OTP di atasnya terbuka penuh. Sikap yang sama dipakai API, yang
            menjawab 503 berikut saran jalan masuk lain ketimbang berpura-pura
            endpoint-nya tidak ada.

            Hanya di langkah nomor: sesudah kode terkirim, menawarkan alur lain
            hanya membingungkan.
          */}
          {clientIdGoogle() !== null && (
            <>
              <p className="text-center text-sm text-gray-700">{t("auth.google.atau")}</p>
              <Tombol varian="sekunder" disabled={sibuk} onClick={() => void mulaiGoogle()}>
                {t("auth.google.tombol")}
              </Tombol>
            </>
          )}
        </form>
      ) : (
        <form onSubmit={kirimKodeVerifikasi} noValidate className="flex flex-col gap-4">
          <KolomForm
            label={t("auth.kode.label")}
            bantuan={t("auth.kode.bantuan", { nomor: nomorE164 })}
            galat={galat}
            wajib
          >
            <Masukan
              ref={kotakKode}
              // SATU kotak, bukan enam. Mitigasi Risks PR-030 apa adanya: pola
              // enam kotak memecah satu nilai menjadi enam kotak yang masing-
              // masing punya label sendiri, memindahkan fokus otomatis di
              // tengah pengetikan, dan membuat tempel-satu-kode gagal — ketiganya
              // menyakitkan justru bagi pengguna screen reader dan pengguna
              // dengan motorik terbatas.
              autoComplete="one-time-code"
              // `inputMode` memunculkan papan angka di ponsel tanpa menolak
              // tempelan teks, berbeda dari `type="number"` yang juga membawa
              // tombol naik-turun yang tidak masuk akal untuk kode.
              inputMode="numeric"
              maxLength={6}
              value={kode}
              onChange={(e) => setKode(e.target.value.replace(/\D/g, ""))}
              disabled={sibuk}
            />
          </KolomForm>

          <Tombol type="submit" disabled={sibuk}>
            {sibuk ? t("auth.kode.memeriksa") : t("auth.kode.masuk")}
          </Tombol>

          <div className="flex flex-wrap gap-2">
            <Tombol
              varian="sekunder"
              disabled={sibuk || sisaDetik > 0}
              onClick={() => void kirimKode(nomorE164, { ulang: true })}
            >
              {sisaDetik > 0
                ? t("auth.kode.tungguKirimUlang", { detik: sisaDetik })
                : t("auth.kode.kirimUlang")}
            </Tombol>

            <Tombol
              varian="hening"
              disabled={sibuk}
              onClick={() => {
                setLangkah("nomor");
                setKode("");
                setGalat(null);
              }}
            >
              {t("auth.kode.gantiNomor")}
            </Tombol>
          </div>
        </form>
      )}
    </main>
  );
}
