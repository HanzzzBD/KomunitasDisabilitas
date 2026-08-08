// modules/users — ekspor data pribadi (PR-022, hak portabilitas UU PDP §8.7).
//
// MASALAH YANG DIPECAHKAN BUKAN "MERAKIT JSON". Hak portabilitas menuntut
// SELURUH data seseorang, dan platform ini akan tumbuh: profil karier, CV,
// lamaran, notifikasi. Ekspor yang merakit semuanya sendiri berarti satu berkas
// yang harus diingat setiap kali modul baru lahir — dan yang lupa diingat tidak
// menimbulkan gejala apa pun. Pengguna hanya menerima ekspor yang kurang, dan
// tidak ada cara ia mengetahuinya.
//
// Karena itu bentuknya REGISTRY: tiap modul mendaftarkan bagiannya sendiri, dan
// service ini hanya menyusun. Dua hal yang membuatnya bukan sekadar gaya:
//
//   1. Tidak ada repository lintas modul. Aturan PR-002 tetap utuh justru
//      karena agregatornya tidak pernah menyentuh tabel milik modul lain.
//   2. Kelengkapannya bisa dijaga mesin. `__tests__/export-kelengkapan.test.ts`
//      membaca schema.prisma dan menuntut setiap tabel berelasi ke User
//      terdaftar sebagai bagian ekspor, ditunda dengan menyebut PR-nya, atau
//      dikecualikan dengan alasan. Tabel baru = build merah sampai diputuskan.
import {
  AUDIT_ACTION,
  dataExportSchema,
  EXPORT_FORMAT_VERSION,
  type DataExport,
} from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import { appError } from "../../../core/http/index.js";
import type { ExportQuotaRepository } from "../repositories/export-quota.repository.js";
import type { UserProfileRepository } from "../repositories/user.repository.js";
import type { UsersActor } from "./users.service.js";

/** Entitas audit modul ini (tanpa PII). */
const AUDIT_ENTITY = "users.account";

/**
 * Kebijakan kuota — satu tempat, dipakai service DAN test.
 *
 * Tiga per 24 jam: cukup untuk mencoba lagi saat unduhan gagal atau berkasnya
 * hilang, terlalu sedikit untuk memanen berulang dengan token curian.
 */
export const EXPORT_POLICY = {
  maxPerWindow: 3,
  windowSeconds: 86_400,
} as const;

/**
 * Satu bagian berkas ekspor, disumbangkan oleh modul pemilik datanya.
 *
 * `bagian` WAJIB punya field dengan nama sama di `dataExportSchema`. Kontributor
 * yang tidak punya tempat di kontrak akan membuat permintaan GAGAL (skema itu
 * `.strict()`) alih-alih datanya dibuang diam-diam — kegagalan yang berisik
 * jauh lebih baik daripada ekspor yang kekurangan tanpa sinyal.
 */
export interface ExportContributor {
  readonly bagian: string;
  /** Data milik `userId` untuk bagian ini. Melempar bila akun tidak aktif. */
  kumpulkan(userId: string): Promise<unknown>;
}

/**
 * Kontributor bagian `account` — milik modul `users` sendiri.
 *
 * Inilah bentuk yang ditiru modul lain nanti: ia membaca repository MODULNYA
 * SENDIRI, lalu memetakan baris DB menjadi kontrak. Pemetaan eksplisit itu
 * yang menjaga kolom internal tidak punya jalan keluar meski kelak ikut
 * terbawa dari repository.
 */
export function createAccountContributor(
  userRepository: Pick<UserProfileRepository, "findAccountForExport">,
): ExportContributor {
  return {
    bagian: "account",
    async kumpulkan(userId) {
      const row = await userRepository.findAccountForExport(userId);
      // requireAuth sudah menolak akun tidak aktif; ketiadaan baris di sini
      // berarti akun dihapus di antara guard dan query ini.
      if (row === null) throw appError("SESI_TIDAK_VALID");

      return {
        id: row.id,
        fullName: row.fullName,
        email: row.email,
        emailVerified: row.emailVerified,
        phone: row.phone,
        role: row.role,
        createdAt: row.createdAt.toISOString(),
        // Diturunkan, bukan disalin: `google_id` adalah pengenal opaque milik
        // Google — tautan kredensial yang tidak berarti apa pun bagi pengguna.
        authMethods: [
          ...(row.phone === null ? [] : (["otp"] as const)),
          ...(row.googleId === null ? [] : (["google"] as const)),
        ],
      };
    },
  };
}

export interface ExportServiceDeps {
  /** Urutannya menentukan urutan key di berkas — jaga tetap stabil. */
  contributors: readonly ExportContributor[];
  quotaRepository: ExportQuotaRepository;
  auditLog: AuditLog;
  /** Sumber waktu; disuntik test. */
  clock?: () => Date;
}

export function createExportService(deps: ExportServiceDeps) {
  const { contributors, quotaRepository, auditLog } = deps;
  const now = deps.clock ?? (() => new Date());

  return {
    /**
     * GET /me/export — rakit seluruh data milik pemilik sesi.
     *
     * Kuota diperiksa LEBIH DULU, sebelum satu pun query berjalan: endpoint ini
     * menyentuh banyak tabel, dan menolak setelah bekerja berarti biaya
     * penyalahgunaan tetap dibayar server.
     */
    async exportMe(actor: UsersActor): Promise<DataExport> {
      const kuota = await quotaRepository.bump(actor.userId, EXPORT_POLICY.windowSeconds);
      if (kuota.value > EXPORT_POLICY.maxPerWindow) {
        throw appError("TERLALU_BANYAK_PERMINTAAN", {
          message: "Anda sudah beberapa kali mengunduh data hari ini",
          hint: "Coba lagi besok, atau simpan berkas yang sudah Anda unduh",
          retryAfterSeconds: kuota.resetInSeconds,
        });
      }

      // Berurutan, bukan Promise.all: urutan key di berkas jadi stabil, dan
      // kegagalan pertama menghentikan sisanya alih-alih menyisakan query yang
      // masih berjalan tanpa ada yang menunggunya.
      const bagian: Record<string, unknown> = {};
      for (const kontributor of contributors) {
        bagian[kontributor.bagian] = await kontributor.kumpulkan(actor.userId);
      }

      // Gerbang terakhir sebelum berkas diserahkan. Ia menangkap dua hal yang
      // tidak akan terlihat di mana pun lagi: kontributor yang menghasilkan
      // bentuk salah, dan kontributor yang belum punya tempat di kontrak.
      const berkas = dataExportSchema.parse({
        formatVersion: EXPORT_FORMAT_VERSION,
        exportedAt: now().toISOString(),
        ...bagian,
      });

      auditLog(
        { actorId: actor.userId, requestId: actor.requestId },
        AUDIT_ACTION.DATA_EXPORTED,
        AUDIT_ENTITY,
        actor.userId,
        {
          format: "json",
          formatVersion: EXPORT_FORMAT_VERSION,
          // Nama bagiannya saja — isinya tidak pernah menyentuh audit_logs.
          sections: contributors.map((k) => k.bagian),
        },
      );

      return berkas;
    },
  };
}

export type ExportService = ReturnType<typeof createExportService>;
