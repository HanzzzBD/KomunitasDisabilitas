// modules/signbridge — service kamus video BISINDO (PR-084, ADR-010 v1).
//
// Yang dijaga di sini adalah JALUR menuju "published": video yang tampil ke
// publik selalu punya caption (.vtt) dan transkrip. Itu kontrol aksesibilitas
// (SDD §7.4), bukan validasi kosmetik — pengguna netra membaca transkripnya,
// pengguna Tuli yang belum lancar BISINDO membaca caption-nya. Karena itu
// aturannya ditegakkan di SERVER (422) dan sekali lagi oleh CHECK di DB.
import {
  AUDIT_ACTION,
  type CreateSignVideo,
  type SignVideoAdmin,
  type SignVideoCategory,
  type SignVideoPublic,
  type SignVideoSearchQuery,
  type UpdateSignVideo,
} from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import { appError } from "../../../core/http/index.js";
import { uuidV7 } from "../../../core/ids/index.js";
import { assertStorageKey, type ObjectStorage } from "../../../core/storage/index.js";
import type {
  SignVideoRow,
  SignVideosRepository,
  SignVideoUpdatePatch,
} from "../repositories/sign-videos.repository.js";

export const AUDIT_ENTITY = "signbridge.sign_video";

export interface SignVideosActor {
  userId: string;
  requestId: string;
}

export interface SignVideosServiceDeps {
  repository: SignVideosRepository;
  auditLog: AuditLog;
  /** undefined = storage belum diatur → pencarian publik 503 (pola PDF CV). */
  storage: Pick<ObjectStorage, "presignDownload"> | undefined;
}

type JenisMedia = "videoKey" | "thumbnailKey" | "captionKey";

/** Ekstensi yang diterima per jenis media; PR-085 mempersempit tipe & ukuran saat presign. */
const EKSTENSI: Record<JenisMedia, readonly string[]> = {
  videoKey: [".mp4", ".webm"],
  captionKey: [".vtt"],
  thumbnailKey: [".jpg", ".jpeg", ".png", ".webp"],
};

/**
 * Key media sah = `sign-videos/{id video ini}/{artefak}` dengan ekstensi yang
 * cocok. Menolak key milik video lain mencegah satu entri kamus diam-diam
 * menayangkan media entri lain (atau domain storage lain, mis. CV).
 */
export function mediaKeySah(id: string, jenis: JenisMedia, key: string): boolean {
  const bagian = key.split("/");
  if (bagian.length !== 3 || bagian[0] !== "sign-videos" || bagian[1] !== id) return false;
  try {
    assertStorageKey(key);
  } catch {
    return false;
  }
  const artefak = (bagian[2] ?? "").toLowerCase();
  return EKSTENSI[jenis].some((ext) => artefak.endsWith(ext) && artefak.length > ext.length);
}

/** Daftar yang masih kurang untuk terbit — kosong = lengkap. Urutannya = urutan di hint. */
export function kekuranganTerbit(row: {
  videoKey: string | null;
  captionKey: string | null;
  transcript: string | null;
}): string[] {
  const kurang: string[] = [];
  if (row.videoKey === null) kurang.push("video");
  if (row.captionKey === null) kurang.push("caption (.vtt)");
  if (row.transcript === null || row.transcript.trim() === "") kurang.push("transkrip");
  return kurang;
}

function tolakBelumLengkap(kurang: string[]): never {
  throw appError("VIDEO_ISYARAT_BELUM_LENGKAP", {
    hint: `Lengkapi dulu: ${kurang.join(", ")}`,
  });
}

function keAdmin(row: SignVideoRow): SignVideoAdmin {
  return {
    id: row.id,
    phrase: row.phrase,
    category: row.category as SignVideoCategory | null,
    status: row.status,
    videoKey: row.videoKey,
    thumbnailKey: row.thumbnailKey,
    captionKey: row.captionKey,
    transcript: row.transcript,
    durationS: row.durationS,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createSignVideosService(deps: SignVideosServiceDeps) {
  const { repository, auditLog, storage } = deps;

  const catat = (actor: SignVideosActor, id: string, operation: "create" | "update" | "publish") =>
    auditLog(
      { actorId: actor.userId, requestId: actor.requestId },
      AUDIT_ACTION.ADMIN_RESOURCE_CHANGED,
      AUDIT_ENTITY,
      id,
      { operation },
    );

  async function kePublik(
    row: SignVideoRow,
    presign: Pick<ObjectStorage, "presignDownload">,
  ): Promise<SignVideoPublic> {
    // Baris published dijamin lengkap oleh CHECK DB; pemeriksaan ini hanya
    // menyempitkan tipe.
    if (row.videoKey === null || row.captionKey === null || row.transcript === null) {
      throw new Error(`sign_videos ${row.id} published tanpa media lengkap`);
    }
    const [video, caption, thumbnail] = await Promise.all([
      presign.presignDownload({ key: row.videoKey }),
      presign.presignDownload({ key: row.captionKey }),
      row.thumbnailKey === null ? null : presign.presignDownload({ key: row.thumbnailKey }),
    ]);
    const kedaluwarsa = [video.expiresAt, caption.expiresAt, thumbnail?.expiresAt]
      .filter((t): t is Date => t !== undefined)
      .reduce((a, b) => (a < b ? a : b));
    return {
      id: row.id,
      phrase: row.phrase,
      category: row.category as SignVideoCategory | null,
      transcript: row.transcript,
      durationS: row.durationS,
      videoUrl: video.url,
      captionUrl: caption.url,
      thumbnailUrl: thumbnail?.url ?? null,
      mediaExpiresAt: kedaluwarsa.toISOString(),
    };
  }

  return {
    /** GET /api/v1/sign-videos — kamus publik, hanya published. */
    async search(query: SignVideoSearchQuery): Promise<SignVideoPublic[]> {
      if (storage === undefined) throw appError("BELUM_SIAP");
      const rows = await repository.search({
        query: query.query,
        category: query.category,
        limit: query.limit,
      });
      return Promise.all(rows.map((row) => kePublik(row, storage)));
    },

    /** GET /api/v1/admin/sign-videos — seluruh entri termasuk draft. */
    async listAdmin(): Promise<SignVideoAdmin[]> {
      return (await repository.listAll()).map(keAdmin);
    },

    /** POST /api/v1/admin/sign-videos — selalu lahir draft; media menyusul (PR-085). */
    async create(actor: SignVideosActor, input: CreateSignVideo): Promise<SignVideoAdmin> {
      const id = uuidV7();
      const row = await repository.create(id, {
        phrase: input.phrase,
        category: input.category,
        transcript: input.transcript ?? null,
        durationS: input.durationS ?? null,
        createdBy: actor.userId,
      });
      catat(actor, id, "create");
      return keAdmin(row);
    },

    /**
     * PUT /api/v1/admin/sign-videos/:id — patch sebagian. Pada video yang SUDAH
     * terbit, patch yang mengosongkan video/caption/transkrip ditolak 422:
     * jalan pintas "terbitkan dulu, hapus caption kemudian" tidak boleh ada.
     */
    async update(
      actor: SignVideosActor,
      id: string,
      input: UpdateSignVideo,
    ): Promise<SignVideoAdmin> {
      const sebelum = await repository.findById(id);
      if (sebelum === null) throw appError("VIDEO_ISYARAT_TIDAK_DITEMUKAN");

      for (const jenis of ["videoKey", "thumbnailKey", "captionKey"] as const) {
        const key = input[jenis];
        if (typeof key === "string" && !mediaKeySah(id, jenis, key)) {
          throw appError("MEDIA_VIDEO_ISYARAT_TIDAK_VALID");
        }
      }

      const patch: SignVideoUpdatePatch = {};
      if (input.phrase !== undefined) patch.phrase = input.phrase;
      if (input.category !== undefined) patch.category = input.category;
      if (input.transcript !== undefined) patch.transcript = input.transcript;
      if (input.durationS !== undefined) patch.durationS = input.durationS;
      if (input.videoKey !== undefined) patch.videoKey = input.videoKey;
      if (input.thumbnailKey !== undefined) patch.thumbnailKey = input.thumbnailKey;
      if (input.captionKey !== undefined) patch.captionKey = input.captionKey;

      if (sebelum.status === "published") {
        const kurang = kekuranganTerbit({ ...sebelum, ...patch });
        if (kurang.length > 0) tolakBelumLengkap(kurang);
      }

      const row = await repository.update(id, patch);
      if (row === null) throw appError("VIDEO_ISYARAT_TIDAK_DITEMUKAN");
      catat(actor, id, "update");
      return keAdmin(row);
    },

    /** POST /api/v1/admin/sign-videos/:id/publish — draft → published, satu arah. */
    async publish(actor: SignVideosActor, id: string): Promise<SignVideoAdmin> {
      const sebelum = await repository.findById(id);
      if (sebelum === null) throw appError("VIDEO_ISYARAT_TIDAK_DITEMUKAN");
      if (sebelum.status === "published") throw appError("VIDEO_ISYARAT_SUDAH_TERBIT");

      const kurang = kekuranganTerbit(sebelum);
      if (kurang.length > 0) tolakBelumLengkap(kurang);

      const row = await repository.publish(id);
      if (row === null) throw appError("VIDEO_ISYARAT_SUDAH_TERBIT");
      catat(actor, id, "publish");
      return keAdmin(row);
    },
  };
}

export type SignVideosService = ReturnType<typeof createSignVideosService>;
