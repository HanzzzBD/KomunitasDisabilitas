// Skrip anti-flash — AC PR-026: "Tidak ada flash-of-wrong-theme saat load
// (init sebelum paint)".
//
// MASALAHNYA. React baru berjalan setelah bundelnya diunduh, diurai, dan
// dieksekusi. Sampai saat itu halaman sudah tergambar dengan gaya bawaan.
// Pengguna yang memilih kontras tinggi atau teks 200% akan melihat kilasan
// tampilan yang justru tidak bisa mereka baca — tepat pada orang yang paling
// membutuhkan setelan itu. Kedipan ini bukan cacat kosmetik.
//
// KENAPA DISALIN, BUKAN DIIMPOR. Skrip ini berjalan di dalam <head>, sebelum
// modul apa pun dimuat; ia tidak bisa mengimpor `tokenDari()` maupun
// `rekonsiliasi()`. Duplikasi logika karena itu tak terhindarkan — yang bisa
// dihindari adalah duplikasi yang MENYIMPANG. `skrip-pra-paint.test.ts`
// menjalankan skrip ini di jsdom lalu membandingkan DOM hasilnya dengan
// keluaran fungsi aslinya, untuk matriks preferensi. Bukan perbandingan teks:
// perbandingan PERILAKU.
/**
 * Kunci penyimpanan, DISALIN dari `KUNCI_PENYIMPANAN` milik `@nawasena/a11y`.
 *
 * Tidak diimpor karena berkas ini dibaca `vite.config.ts`, dan Vite memuat
 * config-nya lewat loader Node yang tidak bisa memetakan `.js` → `.ts` untuk
 * paket workspace bersumber TypeScript. Impor di sini menggagalkan seluruh
 * build DAN seluruh test dengan `ERR_MODULE_NOT_FOUND`.
 *
 * Salinannya dijaga: `skrip-pra-paint.test.ts` membandingkannya dengan konstanta
 * aslinya. Kunci yang menyimpang berarti skrip pra-paint membaca preferensi dari
 * tempat yang salah — dan gejalanya persis kedipan yang hendak dicegah PR ini,
 * hanya saja permanen.
 */
const KUNCI_PENYIMPANAN = "nawasena-a11y";

/**
 * Ditulis sebagai IIFE dalam satu string.
 *
 * Seluruh isinya dibungkus try/catch: kegagalan apa pun di sini — localStorage
 * diblokir mode privat, JSON rusak, `matchMedia` tak ada — harus berakhir pada
 * "halaman tampil dengan gaya bawaan", BUKAN pada halaman kosong. Skrip yang
 * melempar di <head> menghentikan penguraian dokumen.
 */
export const SKRIP_PRA_PAINT = `(function(){try{
var K=${JSON.stringify(KUNCI_PENYIMPANAN)};
var p={};
try{var m=localStorage.getItem(K);if(m){var j=JSON.parse(m);p=(j&&j.state&&j.state.pilihanPengguna)||{}}}catch(e){}
function os(q){try{var r=matchMedia(q);return r.media==="not all"?undefined:r.matches}catch(e){return undefined}}
function pilih(k,q){if(p[k]!==undefined)return p[k];var o=q?os(q):undefined;return o!==undefined?o:false}
var e=document.documentElement;
var s=typeof p.textScale==="number"?p.textScale:100;
e.style.setProperty("--font-scale",String(s/100));
e.style.setProperty("--touch-target-min",(pilih("largeTouchTargets")?56:44)+"px");
function at(n,v,on){if(on)e.setAttribute(n,v);else e.removeAttribute(n)}
at("data-contrast","high",pilih("highContrast","(prefers-contrast: more)"));
at("data-motion","reduced",pilih("reduceMotion","(prefers-reduced-motion: reduce)"));
at("data-lang-mode","simple",pilih("simpleLanguage"));
}catch(e){}})();`;
