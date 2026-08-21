// PELANGGARAN YANG SAMA, DITULIS SEPERTI KODE SUNGGUHAN — penentu ber-ekstensi
// `.js` (NodeNext/ESM), bukan tanpa ekstensi.
//
// KENAPA FIXTURE INI ADA. Seluruh berkas di `apps/api/src` memakai bentuk ini;
// tidak satu pun memakai penentu tanpa ekstensi. Selama fixture preset hanya
// menguji bentuk tanpa ekstensi, gerbang arsitektur ini HIJAU atas kode yang
// tidak pernah benar-benar diperiksanya — resolver `node` gagal memetakan
// `.js` ke berkas `.ts` yang ada, dependensinya tidak terklasifikasi, dan
// `boundaries` melewatinya diam-diam.
//
// Ini kasus regresi: ia harus SELALU merah.
import { usersRepository } from "../../users/repositories/users.repository.js";

export const jobsEsmService = {
  ownerName: () => usersRepository.me(),
};
