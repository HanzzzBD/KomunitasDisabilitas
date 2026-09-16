// modules/resumes — repository (PR-060, SDD §6.2).
//
// SETIAP QUERY MENYEBUT `userId`, TERMASUK YANG SUDAH PUNYA `id` — aturan yang
// sama persis dengan `profiles/repositories/career.repository.ts`, dan alasannya
// juga sama: pemeriksaan kepemilikan yang terpisah dari query-nya adalah
// pemeriksaan yang cepat atau lambat lupa dipasang pada satu jalur baru. Di sini
// jalur yang lupa memeriksa TIDAK BISA DITULIS — tidak ada satu pun fungsi yang
// menerima `id` tanpa `userId`. Baris milik orang lain karena itu berperilaku
// persis seperti baris yang tidak ada, dan itu memang yang benar: 404, bukan
// 403. Jawaban 403 atas id milik orang lain memberi tahu penebak bahwa idnya ADA.
//
// CV BUKAN DATA SENSITIF menurut ADR-007: tidak ada enkripsi kolom di sini, dan
// itu keputusan sadar, bukan kelalaian. Yang membuatnya aman ditulis polos
// adalah bentuk `resumeContentSchema` sendiri — ia tidak punya tempat bagi ragam
// disabilitas maupun kebutuhan akomodasi (lihat kepala berkas skemanya).
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { ResumeContent, ResumeCreatedVia } from "@nawasena/schemas";
import type { AppPrisma } from "../../../core/db/index.js";

/** Baris `resumes` TANPA isinya — bentuk yang dipakai daftar. */
export interface ResumeSummaryRow {
  id: string;
  title: string;
  pdfUrl: string | null;
  createdVia: ResumeCreatedVia;
  createdAt: Date;
  updatedAt: Date;
}

/** Baris `resumes` lengkap. */
export interface ResumeRow extends ResumeSummaryRow {
  content: ResumeContent;
}

/** Kolom yang ditulis saat membuat baris. */
export interface ResumeCreateData {
  title: string;
  content: ResumeContent;
  createdVia: ResumeCreatedVia;
}

/** Kolom yang boleh diubah. `createdVia` TIDAK di sini — jalur lahirnya tidak berubah. */
export interface ResumeUpdatePatch {
  title?: string;
  content?: ResumeContent;
}

const KOLOM_RINGKAS = {
  id: true,
  title: true,
  pdfUrl: true,
  createdVia: true,
  createdAt: true,
  updatedAt: true,
} as const;

const KOLOM_PENUH = { ...KOLOM_RINGKAS, content: true } as const;

/**
 * Urutan baku daftar CV: yang paling baru DISUNTING dulu.
 *
 * `updatedAt`, bukan `createdAt`. Daftar ini dibuka orang yang hendak
 * melanjutkan pekerjaannya, dan yang hendak ia lanjutkan adalah yang terakhir ia
 * sentuh — bukan yang terakhir ia buat. Keduanya berbeda persis pada kasus yang
 * paling sering terjadi: membuat CV kedua, lalu kembali menyempurnakan yang
 * pertama.
 *
 * `id desc` sebagai penengah seri, seperti seluruh repository lain di repo ini:
 * lima baris yang stempel waktunya identik (mis. hasil seed satu transaksi)
 * keluar dalam urutan tetap alih-alih acak.
 */
const URUT = [{ updatedAt: "desc" }, { id: "desc" }] as const;

/** Kolom `content` bertipe `JsonValue`; isinya sudah lolos zod di sisi tulis. */
function keRow(baris: Omit<ResumeRow, "content" | "createdVia"> & {
  content: unknown;
  createdVia: string;
}): ResumeRow {
  return {
    ...baris,
    createdVia: baris.createdVia as ResumeCreatedVia,
    content: baris.content as ResumeContent,
  };
}

function keRingkas(baris: Omit<ResumeSummaryRow, "createdVia"> & { createdVia: string }): ResumeSummaryRow {
  return { ...baris, createdVia: baris.createdVia as ResumeCreatedVia };
}

/** `ResumeContent` → nilai yang diterima kolom `jsonb` Prisma. */
function keJson(isi: ResumeContent): Prisma.InputJsonValue {
  return isi as unknown as Prisma.InputJsonValue;
}

/**
 * Kunci advisory lock untuk satu pengguna — bilangan 64-bit bertanda.
 *
 * DIHITUNG DI SINI, BUKAN OLEH POSTGRESQL (`hashtextextended`), dan alasannya
 * praktis: fungsi ini bisa diuji tanpa database sama sekali. Satu-satunya bagian
 * repository ini yang tidak punya padanan di tabel palsu adalah SQL mentah di
 * bawah, dan memindahkan perhitungannya ke JavaScript menyisakan SQL yang tidak
 * punya apa pun untuk salah.
 *
 * SHA-1 dipakai sebagai fungsi sebar, BUKAN sebagai fungsi kriptografis: yang
 * dituntut hanyalah nilai yang sama untuk userId yang sama dan tersebar rata
 * untuk userId yang berbeda. Tidak ada rahasia yang dilindunginya, dan tabrakan
 * hanya berakibat dua pengguna sesaat saling menunggu.
 */
export function kunciAntreCv(userId: string): bigint {
  // `readBigInt64BE` — BERTANDA, sebab `pg_advisory_xact_lock` menerima `bigint`
  // PostgreSQL yang juga bertanda. Membaca tanpa tanda akan melampaui jangkauan
  // int8 untuk separuh nilai yang mungkin, dan penolakannya baru muncul di
  // produksi pada pengguna yang idnya kebetulan berhash besar.
  return createHash("sha1").update(userId).digest().readBigInt64BE(0);
}

/** Prisma P2003 — pelanggaran foreign key (di sini: `applications.resume_id`). */
const FOREIGN_KEY_VIOLATION = "P2003";

/**
 * Dilempar `deleteOwned` saat CV masih dirujuk sebuah lamaran.
 *
 * Kelas sendiri, bukan `AppError` langsung: repository tidak menentukan status
 * HTTP. Penerjemahannya menjadi 409 ada di service, tempat seluruh keputusan
 * lain tentang jawaban juga tinggal.
 */
export class CvDipakaiLamaranError extends Error {
  constructor() {
    super("CV masih dirujuk oleh lamaran");
    this.name = "CvDipakaiLamaranError";
  }
}

export interface ResumesRepository {
  /** Ringkasan seluruh CV milik satu pengguna, terbaru disunting dulu. */
  listByUser(userId: string): Promise<ResumeSummaryRow[]>;
  /** Satu CV MILIKNYA; null bila tidak ada ATAU milik orang lain. */
  findOwned(userId: string, id: string): Promise<ResumeRow | null>;
  /**
   * Buat CV baru HANYA bila pemiliknya masih di bawah `maks`; null bila batasnya
   * sudah tercapai.
   */
  createIfUnderLimit(
    userId: string,
    id: string,
    data: ResumeCreateData,
    maks: number,
  ): Promise<ResumeRow | null>;
  /** null bila tidak ada/bukan miliknya — tanpa menyentuh baris siapa pun. */
  updateOwned(userId: string, id: string, patch: ResumeUpdatePatch): Promise<ResumeRow | null>;
  /**
   * false bila tidak ada/bukan miliknya. Melempar `CvDipakaiLamaranError` bila
   * baris ada tetapi masih dirujuk lamaran.
   */
  deleteOwned(userId: string, id: string): Promise<boolean>;
}

export function createResumesRepository(prisma: AppPrisma): ResumesRepository {
  return {
    async listByUser(userId) {
      const baris = await prisma.resume.findMany({
        where: { userId },
        orderBy: [...URUT],
        select: KOLOM_RINGKAS,
      });
      return baris.map(keRingkas);
    },

    async findOwned(userId, id) {
      const baris = await prisma.resume.findFirst({ where: { id, userId }, select: KOLOM_PENUH });
      return baris === null ? null : keRow(baris);
    },

    /**
     * HITUNG LALU TULIS, DI DALAM SATU TRANSAKSI, DI BELAKANG KUNCI PER PENGGUNA.
     *
     * Kenapa bukan sekadar `count()` lalu `create()` di service: dua permintaan
     * POST yang tiba bersamaan akan sama-sama membaca hitungan LAMA, sama-sama
     * menyimpulkan masih ada tempat, lalu sama-sama menulis. Batas yang bisa
     * dilewati dengan mengklik dua kali bukan batas — dan justru klik gandalah
     * yang paling sering terjadi pada koneksi lambat, yakni keadaan yang paling
     * lazim bagi pengguna yang kita layani.
     *
     * `pg_advisory_xact_lock` MENUNGGU, bukan membatalkan. Itulah alasannya
     * dipilih ketimbang isolasi `Serializable`, yang secara teori cukup:
     * Serializable menjawab tabrakan dengan MEMBATALKAN salah satu transaksi
     * (SQLSTATE 40001), sehingga repository ini harus punya lingkaran coba-ulang
     * — dan lingkaran coba-ulang yang terbatas akan habis di bawah tekanan,
     * lalu menjawab permintaan yang seharusnya 201 atau 409 dengan 500. Batas
     * yang benar tetapi kadang-kadang menjawab "terjadi kesalahan pada server"
     * bukan perbaikan atas batas yang bisa dilewati; ia hanya kegagalan yang
     * lebih jarang dan lebih membingungkan.
     *
     * Kuncinya adalah hash `userId` (`kunciAntreCv`), jadi dua pengguna berbeda
     * BISA jatuh pada kunci yang sama dan saling menunggu. Konsekuensinya sepele
     * dan disengaja: yang ditunggu hanyalah satu `count` + satu `INSERT` pada
     * tabel ber-indeks `user_id`, dan pembuatan CV bukan operasi yang dilakukan
     * berkali-kali per detik. Kunci dilepas otomatis saat transaksi selesai —
     * `_xact_` — jadi tidak ada kunci yang bisa tertinggal karena galat di
     * tengah jalan.
     */
    createIfUnderLimit(userId, id, data, maks) {
      return prisma.$transaction(async (tx) => {
        // Kunci dikirim sebagai TEKS lalu di-cast, bukan sebagai angka.
        // `pg_advisory_xact_lock` punya dua tanda tangan — `(bigint)` dan
        // `(int, int)` — sehingga parameter tanpa tipe membuat PostgreSQL gagal
        // memilih salah satunya ("function is not unique"). `::bigint` pada
        // literal teks menyelesaikannya tanpa bergantung pada cara Prisma
        // menyerialkan `bigint` JavaScript.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${kunciAntreCv(userId).toString()}::bigint)`;

        const jumlah = await tx.resume.count({ where: { userId } });
        if (jumlah >= maks) return null;

        const baris = await tx.resume.create({
          data: {
            id,
            userId,
            title: data.title,
            content: keJson(data.content),
            createdVia: data.createdVia,
          },
          select: KOLOM_PENUH,
        });
        return keRow(baris);
      });
    },

    async updateOwned(userId, id, patch) {
      const data: Prisma.ResumeUpdateManyMutationInput = {};
      if (patch.title !== undefined) data.title = patch.title;
      if (patch.content !== undefined) data.content = keJson(patch.content);

      const { count } = await prisma.resume.updateMany({ where: { id, userId }, data });
      if (count === 0) return null;
      // Dua statement, bukan satu transaksi — alasannya sama dengan
      // `career.repository.ts`: satu-satunya yang bisa menghapus baris ini di
      // antaranya adalah PEMILIKNYA SENDIRI dari permintaan lain, dan jawaban
      // 404 pada kasus itu justru yang benar.
      const baris = await prisma.resume.findFirst({ where: { id, userId }, select: KOLOM_PENUH });
      return baris === null ? null : keRow(baris);
    },

    async deleteOwned(userId, id) {
      try {
        const { count } = await prisma.resume.deleteMany({ where: { id, userId } });
        return count > 0;
      } catch (err) {
        // `applications.resume_id` memakai `onDelete: NoAction` DENGAN SENGAJA
        // (lihat komentar di schema.prisma): hapus akun tetap membersihkan
        // semuanya lewat cascade dari `users`, tetapi menghapus satu CV yang
        // masih menjadi lampiran sebuah lamaran ditolak database. Tanpa
        // terjemahan di sini, penolakan yang benar itu sampai ke pengguna
        // sebagai 500 tanpa keterangan apa pun.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === FOREIGN_KEY_VIOLATION
        ) {
          throw new CvDipakaiLamaranError();
        }
        throw err;
      }
    },
  };
}
