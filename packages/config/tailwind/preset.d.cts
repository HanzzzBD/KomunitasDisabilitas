// Deklarasi tipe untuk preset CommonJS di sebelahnya.
//
// Preset ditulis `.cjs` karena Tailwind memuatnya lewat `require()` dari
// `tailwind.config.cjs` milik tiap aplikasi — bukan lewat bundler. Berkas ini
// memberi tipe tanpa mengubah bentuk pemuatannya.
import type { Config } from "tailwindcss";

declare const preset: Config;
export default preset;
