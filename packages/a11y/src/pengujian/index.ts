// Perkakas PENGUJIAN aksesibilitas — entry terpisah dari inti dan dari adapter web.
//
// Dipisah karena ia menarik `axe-core` (± 500 KB belum termampat), dan itu
// tidak boleh punya jalan masuk ke bundel aplikasi. Tidak ada satu pun berkas
// di `src/index.ts` maupun `src/web/index.ts` yang mengimpor berkas di sini —
// dijaga `pengujian-terpisah.test.ts`, dan penjaga budget bundel `apps/web`
// adalah jaring keduanya.
export {
  harusLolosAksesibilitas,
  periksaAksesibilitas,
  laporkan,
  TAK_BISA_DI_JSDOM,
  type OpsiPeriksa,
} from "./axe.js";
