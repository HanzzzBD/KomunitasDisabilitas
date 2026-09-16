// modules/resumes — service (PR-060, PRD US-05).
//
// JALUR NON-AI PEMBUATAN CV. Bukan fitur cadangan yang enak dimiliki: graceful
// degradation adalah KEWAJIBAN produk (PRD), dan yang membuatnya mungkin adalah
// kenyataan bahwa jalur ini tidak menyentuh gateway AI sama sekali. Kuota habis,
// Gemini tumbang, Groq ikut tumbang — pengguna tetap bisa menyusun CV lengkap
// dan mengunduhnya (PR-063/064).
//
// `userId` SELALU dari sesi, TIDAK PERNAH dari input. Tidak ada satu pun fungsi
// di berkas ini yang punya parameter untuk menyebut pengguna lain; aturan yang
// sama dengan `profiles/services/career.service.ts`.
import type {
  CreateResume,
  Resume,
  ResumeCreatedVia,
  ResumeSummary,
  UpdateResume,
} from "@nawasena/schemas";
import { appError } from "../../../core/http/index.js";
import { uuidV7 } from "../../../core/ids/index.js";
import {
  CvDipakaiLamaranError,
  type ResumeRow,
  type ResumeSummaryRow,
  type ResumesRepository,
} from "../repositories/resumes.repository.js";

/** Identitas pemanggil — disusun controller dari sesi, tidak pernah dari body. */
export interface ResumesActor {
  userId: string;
}

/**
 * CV tidak ada ATAU milik orang lain — keduanya dijawab sama.
 *
 * 404, bukan 403, dengan alasan yang sama seperti sub-entitas karier: membedakan
 * keduanya memberi tahu penebak UUID bahwa id yang ia coba itu ADA dan dimiliki
 * seseorang, dan bagi pemilik yang sah jawaban "ada tetapi bukan milikmu" tidak
 * mungkin muncul.
 */
function tidakDitemukan() {
  return appError("CV_TIDAK_DITEMUKAN");
}

function keRingkasan(row: ResumeSummaryRow): ResumeSummary {
  return {
    id: row.id,
    title: row.title,
    pdfUrl: row.pdfUrl,
    createdVia: row.createdVia,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Baris DB → kontrak API. Eksplisit, supaya kolom baru tak punya jalan keluar sendiri. */
function keResume(row: ResumeRow): Resume {
  return { ...keRingkasan(row), content: row.content };
}

export interface ResumesServiceDeps {
  repo: ResumesRepository;
  /**
   * Batas CV per pengguna — dari `env.RESUME_MAX_PER_USER`, BUKAN konstanta di
   * berkas ini. Yang dijaga bukan sekadar bisa-diubah-tanpa-deploy: service yang
   * membaca env sendiri adalah service yang tidak bisa diuji pada batas lain
   * tanpa menyentuh `process.env` global (lihat ADR-015 dan pola yang sama pada
   * `fieldKeys` di modul profiles).
   */
  maksPerPengguna: number;
}

export interface ResumesService {
  list(actor: ResumesActor): Promise<ResumeSummary[]>;
  get(actor: ResumesActor, id: string): Promise<Resume>;
  /**
   * `createdVia` adalah PARAMETER, bukan bagian dari `input`.
   *
   * Endpoint `/me/resumes` selalu memanggilnya dengan `"manual"`; jalur
   * percakapan AI (PR-066) memanggil service yang SAMA dengan `"ai_chat"`.
   * Itulah yang membuat kedua jalur berbagi satu tempat penegakan batas, satu
   * kontrak isi, dan satu pemetaan baris — alih-alih dua service yang lambat
   * laun berbeda pada hal yang tidak ada yang memeriksanya.
   */
  create(actor: ResumesActor, input: CreateResume, createdVia?: ResumeCreatedVia): Promise<Resume>;
  update(actor: ResumesActor, id: string, input: UpdateResume): Promise<Resume>;
  remove(actor: ResumesActor, id: string): Promise<void>;
}

export function createResumesService(deps: ResumesServiceDeps): ResumesService {
  const { repo, maksPerPengguna } = deps;

  return {
    async list(actor) {
      return (await repo.listByUser(actor.userId)).map(keRingkasan);
    },

    async get(actor, id) {
      const row = await repo.findOwned(actor.userId, id);
      if (row === null) throw tidakDitemukan();
      return keResume(row);
    },

    async create(actor, input, createdVia = "manual") {
      // Penegakan batasnya ada DI DALAM satu transaksi di repository, bukan
      // sebagai `count()` terpisah di sini — lihat `createIfUnderLimit`. `null`
      // berarti batasnya sudah tercapai, dan itu satu-satunya arti `null` di
      // sana: kegagalan lain melempar.
      const row = await repo.createIfUnderLimit(
        actor.userId,
        // id tidak pernah datang dari klien: id pilihan klien adalah id yang
        // bisa ditebak, dan baris yang idnya bisa ditebak adalah baris yang bisa
        // ditabrak dengan sengaja.
        uuidV7(),
        { title: input.title, content: input.content, createdVia },
        maksPerPengguna,
      );
      if (row === null) {
        throw appError("BATAS_CV_TERCAPAI", {
          // Angkanya disebutkan: "sudah mencapai batas" tanpa menyebut batasnya
          // memaksa pengguna menghitung sendiri berapa yang harus ia hapus.
          message: `Anda hanya bisa menyimpan ${String(maksPerPengguna)} CV`,
        });
      }
      return keResume(row);
    },

    async update(actor, id, input) {
      const row = await repo.updateOwned(actor.userId, id, {
        title: input.title,
        content: input.content,
      });
      if (row === null) throw tidakDitemukan();
      return keResume(row);
    },

    async remove(actor, id) {
      // `catch` menempel pada PANGGILAN REPOSITORY, bukan membungkus seluruh
      // badan fungsi: 404 di bawah dilempar oleh service sendiri, dan blok
      // try/catch yang ikut menangkapnya adalah blok yang suatu saat akan
      // menelan error yang justru ingin dilihat.
      const terhapus = await repo.deleteOwned(actor.userId, id).catch((err: unknown) => {
        // Penolakan FK dari `applications.resume_id` — aturan database, bukan
        // kegagalan server. Tanpa terjemahan ini ia sampai ke pengguna sebagai
        // "terjadi kesalahan pada server" tanpa satu pun petunjuk.
        if (err instanceof CvDipakaiLamaranError) throw appError("CV_DIPAKAI_LAMARAN");
        throw err;
      });
      if (!terhapus) throw tidakDitemukan();
    },
  };
}
