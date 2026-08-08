// Akar komponen aplikasi.
//
// Isinya sengaja masih sangat sedikit — PR-025a hanya membuktikan bahwa
// rangkaian Vite → React → DOM benar-benar hidup dan bisa di-lint, di-typecheck,
// serta diuji. Router dan provider stack menyusul di PR-025b; error boundary,
// banner offline, dan skeleton di PR-025c.
//
// Yang sudah ditegakkan sejak sekarang, karena memperbaikinya belakangan
// berarti menyentuh setiap halaman yang telanjur lahir:
//   - satu `<main>` sebagai landmark, sehingga pengguna screen reader punya
//     tujuan lompat sejak halaman pertama;
//   - tepat satu `<h1>` per halaman.
// Skip-link dan landmark lengkap difinalkan di PR-032.

export function App() {
  return (
    <main>
      <h1>Nawasena</h1>
      <p>Ekosistem karier inklusif untuk penyandang disabilitas.</p>
    </main>
  );
}
