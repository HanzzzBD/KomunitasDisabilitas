// modules/users — service profil akun (PR-020).
//
// Satu aturan yang mengikat seluruh file: userId SELALU datang dari sesi
// (`authOf(req)`), TIDAK PERNAH dari input. Service ini bahkan tidak punya
// parameter untuk menyebut pengguna lain — itulah bentuk "User A tidak bisa
// baca/ubah user B" yang paling sulit dilanggar tanpa sengaja: bukan
// pemeriksaan yang bisa lupa dipasang, melainkan saluran yang tidak ada.
import { AUDIT_ACTION, type Me, type UpdateMe } from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import { appError } from "../../../core/http/index.js";
import {
  EmailSudahDipakaiError,
  type UserProfileRepository,
  type UserProfileRow,
} from "../repositories/user.repository.js";

/** Entitas audit modul ini (tanpa PII). */
const AUDIT_ENTITY = "users.account";

/** Konteks pemanggil untuk audit. */
export interface UsersActor {
  userId: string;
  requestId: string;
}

export interface UsersServiceDeps {
  userRepository: UserProfileRepository;
  auditLog: AuditLog;
}

/**
 * Baris DB → kontrak API. Pemetaan eksplisit ini adalah lapisan kedua yang
 * menjaga AC "response tanpa field internal": andai repository kelak ikut
 * membawa kolom baru, kolom itu tetap tidak punya jalan keluar dari sini.
 */
function keProfil(row: UserProfileRow): Me {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createUsersService(deps: UsersServiceDeps) {
  const { userRepository, auditLog } = deps;

  return {
    /** GET /me — profil pemilik sesi. */
    async getMe(actor: UsersActor): Promise<Me> {
      const row = await userRepository.findActiveById(actor.userId);
      // requireAuth sudah menolak akun tidak aktif, jadi ketiadaan baris di
      // sini berarti akun dihapus di antara guard dan query ini.
      if (row === null) throw appError("SESI_TIDAK_VALID");
      return keProfil(row);
    },

    /**
     * PUT /me — perbarui nama dan/atau email.
     *
     * Email dibaca DULU untuk mengetahui apakah ia benar-benar berubah: audit
     * perubahan email harus mencatat perubahan, bukan setiap kali formulir
     * pengaturan disimpan. Tanpa itu, jejak keamanan yang seharusnya jarang
     * akan tenggelam di antara penyimpanan nama yang rutin.
     */
    async updateMe(actor: UsersActor, input: UpdateMe): Promise<Me> {
      const sebelum = await userRepository.findActiveById(actor.userId);
      if (sebelum === null) throw appError("SESI_TIDAK_VALID");
      // Disalin sebagai NILAI, bukan dibaca ulang dari `sebelum` setelah tulis.
      // Perbedaannya baru terasa bila baris yang dikembalikan repository ternyata
      // objek yang sama dengan yang diperbarui: perbandingan "berubah atau tidak"
      // akan selalu berkata "tidak", dan audit email hilang tanpa gejala apa pun.
      const emailSebelum = sebelum.email;

      let updated;
      try {
        updated = await userRepository.updateProfile(actor.userId, {
          fullName: input.fullName,
          email: input.email,
        });
      } catch (err) {
        if (err instanceof EmailSudahDipakaiError) {
          // 409, bukan 400: inputnya sah bentuknya — yang bentrok adalah
          // keadaan dunia. Pesannya sengaja tidak memastikan bahwa akun lain
          // memang ada ("tidak bisa dipakai"), supaya endpoint ini tidak
          // menjadi alat memeriksa email siapa yang terdaftar di Nawasena.
          throw appError("EMAIL_TIDAK_BISA_DIPAKAI");
        }
        throw err;
      }
      if (updated === null) throw appError("SESI_TIDAK_VALID");

      // `undefined` = email tidak dikirim, jadi tidak mungkin berubah.
      if (input.email !== undefined && input.email !== emailSebelum) {
        auditLog(
          { actorId: actor.userId, requestId: actor.requestId },
          AUDIT_ACTION.ACCOUNT_EMAIL_CHANGED,
          AUDIT_ENTITY,
          actor.userId,
          { hadPreviousEmail: emailSebelum !== null, cleared: input.email === null },
        );
      }

      return keProfil(updated);
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
