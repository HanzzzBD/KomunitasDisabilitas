// modules/signbridge — service kamus video BISINDO (PR-084, ADR-010 v1).
//
// Yang dijaga di sini adalah JALUR menuju "published": video yang tampil ke
// publik selalu punya caption (.vtt) dan transkrip. Itu kontrol aksesibilitas
// (SDD §7.4), bukan validasi kosmetik — pengguna netra membaca transkripnya,
// pengguna Tuli yang belum lancar BISINDO membaca caption-nya. Karena itu
// aturannya ditegakkan di SERVER (422) dan sekali lagi oleh CHECK di DB.
import {
  AUDIT_ACTION,
  SIGN_VIDEO_MEDIA,
  type CreateSignVideo,
  type SignVideoAdmin,
  type SignVideoCategory,
  type SignVideoMediaKind,
  type SignVideoPresign,
  type SignVideoPresignResult,
  type SignVideoPublic,
  type SignVideoSearchQuery,
  type UpdateSignVideo,
} from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import { appError } from "../../../core/http/index.js";
import { uuidV7 } from "../../../core/ids/index.js";
import {
  assertStorageKey,
  buildStorageKey,
  type ObjectStorage,
} from "../../../core/storage/index.js";
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
  /** undefined = storage belum diatur → pencarian, presign, dan simpan key 503 (pola PDF CV). */
  storage: SignVideoStorage | undefined;
}

export type SignVideoStorage = Pick<ObjectStorage, "presignDownload" | "presignUpload" | "stat">;

type JenisMedia = "videoKey" | "thumbnailKey" | "captionKey";

const KIND_DARI_KOLOM: Record<JenisMedia, SignVideoMediaKind> = {
  videoKey: "video",
  captionKey: "caption",
  thumbnailKey: "thumbnail",
};

/**
 * Ekstensi yang diterima per jenis media. Turunan `SIGN_VIDEO_MEDIA` (key buatan
 * presign PR-085) + `.jpeg` (key PR-084 yang mungkin sudah tersimpan).
 */
const EKSTENSI: Record<JenisMedia, readonly string[]> = {
  videoKey: Object.values(SIGN_VIDEO_MEDIA.video.tipe).map((e) => `.${e}`),
  captionKey: Object.values(SIGN_VIDEO_MEDIA.caption.tipe).map((e) => `.${e}`),
  thumbnailKey: [...Object.values(SIGN_VIDEO_MEDIA.thumbnail.tipe).map((e) => `.${e}`), ".jpeg"],
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

  const catat = (
    actor: SignVideosActor,
    id: string,
    operation: "create" | "update" | "publish" | "unpublish",
  ) =>
    auditLog(
      { actorId: actor.userId, requestId: actor.requestId },
      AUDIT_ACTION.ADMIN_RESOURCE_CHANGED,
      AUDIT_ENTITY,
      id,
      { operation },
    );

  /**
   * Objek di balik key harus SUDAH ada, dengan ukuran & tipe yang diizinkan.
   * Ukuran juga terikat ke signature presign, tetapi pemeriksaan di sini yang
   * menjadi penentu: key yang tidak lewat presign (mis. diketik tangan) atau
   * unggahan yang belum selesai tidak pernah tersimpan.
   */
  async function periksaObjek(
    penyimpanan: SignVideoStorage,
    jenis: JenisMedia,
    key: string,
  ): Promise<void> {
    const aturan = SIGN_VIDEO_MEDIA[KIND_DARI_KOLOM[jenis]];
    const objek = await penyimpanan.stat(key);
    if (objek === null) throw appError("BERKAS_VIDEO_ISYARAT_TIDAK_ADA");
    const tipeSah = objek.contentType !== null && objek.contentType in aturan.tipe;
    if (objek.size > aturan.maksByte || !tipeSah) {
      throw appError("MEDIA_VIDEO_ISYARAT_TIDAK_VALID");
    }
  }

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
        if (typeof key !== "string" || key === sebelum[jenis]) continue;
        if (!mediaKeySah(id, jenis, key)) throw appError("MEDIA_VIDEO_ISYARAT_TIDAK_VALID");
        if (storage === undefined) throw appError("BELUM_SIAP");
        await periksaObjek(storage, jenis, key);
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

    /**
     * POST /api/v1/admin/sign-videos/:id/unpublish — published → draft (PR-085,
     * keputusan owner 2026-10-03): video keliru bisa segera hilang dari publik.
     * Media & transkrip tetap utuh, jadi entri bisa langsung diterbitkan lagi.
     */
    async unpublish(actor: SignVideosActor, id: string): Promise<SignVideoAdmin> {
      const sebelum = await repository.findById(id);
      if (sebelum === null) throw appError("VIDEO_ISYARAT_TIDAK_DITEMUKAN");
      if (sebelum.status === "draft") throw appError("VIDEO_ISYARAT_BELUM_TERBIT");

      const row = await repository.unpublish(id);
      if (row === null) throw appError("VIDEO_ISYARAT_BELUM_TERBIT");
      catat(actor, id, "unpublish");
      return keAdmin(row);
    },

    /**
     * POST /api/v1/admin/sign-videos/presign — izin unggah SATU berkas langsung
     * dari browser ke bucket. Tipe & ukuran sudah disaring zod; key selalu baru
     * (`{kind}-{uuid}.{ext}`) supaya unggahan tidak pernah menimpa media yang
     * sedang tayang — publik baru melihatnya setelah key disimpan lewat PUT.
     */
    async presign(input: SignVideoPresign): Promise<SignVideoPresignResult> {
      if (storage === undefined) throw appError("BELUM_SIAP");
      const entri = await repository.findById(input.videoId);
      if (entri === null) throw appError("VIDEO_ISYARAT_TIDAK_DITEMUKAN");

      const aturan = SIGN_VIDEO_MEDIA[input.kind];
      const ext = (aturan.tipe as Record<string, string>)[input.contentType];
      if (ext === undefined) throw appError("MEDIA_VIDEO_ISYARAT_TIDAK_VALID");
      const key = buildStorageKey("sign-videos", entri.id, `${input.kind}-${uuidV7()}.${ext}`);

      const izin = await storage.presignUpload({
        key,
        contentType: input.contentType,
        contentLength: input.size,
        maxBytes: aturan.maksByte,
      });
      return {
        key,
        uploadUrl: izin.url,
        method: izin.method,
        headers: izin.headers,
        expiresAt: izin.expiresAt.toISOString(),
      };
    },
  };
}

export type SignVideosService = ReturnType<typeof createSignVideosService>;
