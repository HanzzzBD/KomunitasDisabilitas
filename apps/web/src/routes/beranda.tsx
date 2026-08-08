// Halaman "/" — sementara. Landing sesungguhnya (nilai produk, CTA, SEO) lahir
// di PR-032; yang ada di sini hanya cukup untuk membuktikan route termuat lazy.
import { Link } from "react-router";

export function Beranda() {
  return (
    <main>
      <h1>Nawasena</h1>
      <p>Ekosistem karier inklusif untuk penyandang disabilitas.</p>
      {/* <Link>, bukan <a href>: navigasi dalam aplikasi tidak boleh memuat
          ulang seluruh halaman — pemuatan ulang membuang fokus keyboard dan
          memaksa screen reader membacakan halaman dari awal. */}
      <Link to="/masuk">Masuk</Link>
    </main>
  );
}
