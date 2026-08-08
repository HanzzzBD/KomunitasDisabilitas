// modules/auth — siklus hidup sesi: terbit, rotasi, reuse detection (PR-018a).
//
// ATURAN ROTASI (SDD §8.1): satu refresh token dipakai TEPAT SEKALI. Setiap
// pemakaian mencabutnya dan menerbitkan penggantinya dalam keluarga yang sama.
//
// Dari aturan itu lahir reuse detection: token yang sudah dicabut TIDAK PUNYA
// alasan sah untuk muncul lagi. Kalau ia muncul, salah satu dari dua hal
// terjadi — penyerang memakai token curian, atau pengguna sah memakai token
// yang sudah dicuri dan dirotasi penyerang. Kita tidak bisa membedakan
// keduanya, dan justru karena itu jawabannya sama: cabut SELURUH keluarga.
// Yang jujur tinggal masuk lagi; yang mencuri kehilangan seluruh pijakannya.
//
// Mengapa "cabut seluruh keluarga" dan bukan "cabut token itu saja": token itu
// sendiri sudah dicabut — mencabutnya lagi tidak melakukan apa pun. Yang masih
// hidup adalah keturunannya, dan salah satu dari keturunan itulah yang ada di
// tangan penyerang.
import { AUDIT_ACTION } from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import { appError } from "../../../core/http/index.js";
import { uuidV7 } from "../../../core/ids/index.js";
import { SESSION_POLICY, type RefreshMaterial, type TokenService } from "../../../core/auth/index.js";
import type { AuthUserRepository } from "../repositories/user.repository.js";
import type { RefreshTokenRepository } from "../repositories/refresh-token.repository.js";

/** Entitas audit modul ini (tanpa PII). */
const AUDIT_ENTITY = "auth.session";

/** Pasangan token yang dikembalikan ke klien. */
export interface SessionTokens {
  accessToken: string;
  /** Nilai mentah — diberikan SEKALI, tidak pernah bisa dibaca ulang dari DB. */
  refreshToken: string;
  /** Detik hingga access token kedaluwarsa (klien memakainya menjadwalkan refresh). */
  expiresIn: number;
  /** Kapan refresh berakhir — dipakai PR-018b menyetel Max-Age cookie. */
  refreshExpiresAt: Date;
}

/** Konteks pemanggil untuk audit. */
export interface SessionActor {
  requestId: string;
}

export interface SessionServiceDeps {
  tokenService: TokenService;
  userRepository: AuthUserRepository;
  refreshTokenRepository: RefreshTokenRepository;
  auditLog: AuditLog;
  /** Sumber waktu; disuntik test. */
  clock?: () => Date;
}

export function createSessionService(deps: SessionServiceDeps) {
  const { tokenService, userRepository, refreshTokenRepository, auditLog } = deps;
  const now = deps.clock ?? (() => new Date());

  /** Tanda tangani access + terbitkan refresh; penyimpanan urusan pemanggil. */
  async function terbitkan(user: {
    id: string;
    role: "seeker" | "admin" | "employer";
    tokenVersion: number;
  }): Promise<{ tokens: SessionTokens; refresh: RefreshMaterial }> {
    const accessToken = await tokenService.signAccessToken({
      sub: user.id,
      role: user.role,
      ver: user.tokenVersion,
    });
    const refresh = tokenService.issueRefreshToken();
    return {
      tokens: {
        accessToken,
        refreshToken: refresh.token,
        expiresIn: SESSION_POLICY.accessTtlSeconds,
        refreshExpiresAt: refresh.expiresAt,
      },
      refresh,
    };
  }

  return {
    /**
     * Login berhasil (OTP/Google) → sesi baru. Setiap login memulai KELUARGA
     * BARU: perangkat yang satu tidak boleh ikut mati saat keluarga perangkat
     * lain dicabut karena reuse.
     */
    async issue(userId: string): Promise<SessionTokens> {
      const user = await userRepository.findActiveSessionUser(userId);
      // Pemanggil baru saja membuat/menemukan akun ini, jadi ketiadaannya
      // berarti kondisi balapan yang tidak sah untuk dilanjutkan.
      if (user === null) throw appError("SESI_TIDAK_VALID");

      const familyId = uuidV7();
      const { tokens, refresh } = await terbitkan(user);
      await refreshTokenRepository.insert({
        userId: user.id,
        tokenHash: refresh.tokenHash,
        familyId,
        expiresAt: refresh.expiresAt,
      });
      return tokens;
    },

    /**
     * POST /auth/refresh — tukar refresh dengan pasangan baru.
     *
     * Urutan pemeriksaan di bawah ini adalah keamanannya, jangan ditukar:
     * reuse diperiksa SEBELUM kedaluwarsa, sebab token curian yang sudah lewat
     * 30 hari tetap bukti bahwa keluarganya bocor dan tetap harus memicu
     * pencabutan.
     */
    async refresh(rawToken: string, actor: SessionActor): Promise<SessionTokens> {
      const saatIni = now();
      const row = await refreshTokenRepository.findByHash(tokenService.hashRefreshToken(rawToken));

      // Tidak dikenal: tidak pernah ada, atau sudah dibersihkan job retensi.
      if (row === null) throw appError("SESI_TIDAK_VALID");

      if (row.revokedAt !== null) {
        // Sebab pencabutan menentukan apakah ini insiden atau sekadar klien
        // basi. Hanya token yang dicabut karena ROTASI yang mencurigakan: ia
        // seharusnya sudah dibuang klien saat penggantinya diterima, jadi
        // kemunculannya kembali berarti ada salinan di tempat lain.
        //
        // Token yang dicabut karena logout/hapus akun TIDAK memicu alarm:
        // keluarganya memang sengaja dimatikan, tidak ada lagi yang perlu
        // dilindungi, dan mengalarmkannya hanya akan membuat sinyal keamanan
        // berisik oleh perilaku yang normal (tab lain yang belum tahu bahwa
        // pengguna sudah keluar). NULL diperlakukan sebagai rotasi — itulah
        // satu-satunya sebab yang mungkin sebelum kolom ini ada (PR-018a).
        const karenaRotasi = row.revokedReason === null || row.revokedReason === "rotated";
        if (!karenaRotasi) throw appError("SESI_TIDAK_VALID");

        // Baris pemicu ditandai juga: ia bukti paling langsung dari insiden,
        // dan retensi (PR-024) memakai `reuse` untuk menyimpannya 2 tahun.
        await refreshTokenRepository.markReuse(row.id);
        const revokedCount = await refreshTokenRepository.revokeFamily(
          row.familyId,
          saatIni,
          "reuse",
        );
        auditLog(
          { actorId: row.userId, requestId: actor.requestId },
          AUDIT_ACTION.AUTH_REFRESH_REUSED,
          AUDIT_ENTITY,
          row.userId,
          { revokedCount },
        );
        throw appError("SESI_TIDAK_VALID");
      }

      if (row.expiresAt.getTime() <= saatIni.getTime()) throw appError("SESI_TIDAK_VALID");

      // Akun terhapus (atau sedang dihapus) tidak boleh memperpanjang sesi.
      const user = await userRepository.findActiveSessionUser(row.userId);
      if (user === null) throw appError("SESI_TIDAK_VALID");

      const { tokens, refresh } = await terbitkan(user);
      const rotated = await refreshTokenRepository.rotate({
        currentId: row.id,
        nextTokenHash: refresh.tokenHash,
        nextExpiresAt: refresh.expiresAt,
        userId: row.userId,
        familyId: row.familyId,
        now: saatIni,
      });
      // null = ada permintaan lain yang mencabut baris ini lebih dulu. Access
      // token yang sudah ditandatangani di atas TIDAK dikembalikan: sesi ini
      // kalah balapan, dan menyerahkan separuh pasangan hanya membuat klien
      // memegang access token tanpa refresh yang mendampinginya.
      if (rotated === null) throw appError("SESI_TIDAK_VALID");

      return tokens;
    },

    /**
     * POST /auth/logout — keluar dari PERANGKAT INI.
     *
     * Mencabut satu keluarga, bukan satu baris: keluarga adalah rantai rotasi
     * milik satu login, jadi mencabutnya berarti perangkat itu benar-benar
     * kehilangan sesinya. Perangkat lain punya keluarga sendiri dan tidak
     * tersentuh.
     *
     * IDEMPOTEN dan tidak pernah gagal karena token: token tak dikenal atau
     * sudah dicabut tetap dianggap selesai. Pengguna yang menekan "keluar"
     * TIDAK boleh melihat pesan kesalahan — apa pun jawabannya, ia memang
     * sudah tidak punya sesi. Membedakannya juga akan menjadikan endpoint ini
     * alat penebak token yang sah.
     */
    async logout(rawToken: string): Promise<void> {
      const row = await refreshTokenRepository.findByHash(tokenService.hashRefreshToken(rawToken));
      if (row === null || row.revokedAt !== null) return;
      await refreshTokenRepository.revokeFamily(row.familyId, now(), "logout");
    },

    /**
     * POST /auth/logout-all — keluar dari SEMUA perangkat (SDD §8.1).
     *
     * Dua langkah yang saling melengkapi: `ver` bump mematikan access token
     * yang sedang beredar seketika, dan pencabutan seluruh refresh mencegah
     * sesi mana pun menerbitkan yang baru. Tanpa langkah kedua, refresh yang
     * tersisa akan segera memberi access token ber-`ver` baru — bump-nya jadi
     * tidak ada artinya.
     *
     * Urutannya penting: bump DULU, baru cabut. Kebalikannya meninggalkan
     * jendela saat refresh sudah tercabut tetapi access token lama masih sah.
     */
    async logoutAll(userId: string): Promise<{ tokenVersion: number; revokedCount: number }> {
      const tokenVersion = await userRepository.bumpTokenVersion(userId);
      if (tokenVersion === null) throw appError("SESI_TIDAK_VALID");
      const revokedCount = await refreshTokenRepository.revokeAllForUser(
        userId,
        now(),
        "logout_all",
      );
      return { tokenVersion, revokedCount };
    },

    /**
     * Pemilik sesi dari refresh token; null bila token tidak dikenal, sudah
     * dicabut, ATAU akunnya tidak aktif lagi.
     *
     * Pemeriksaan akun ada di sini supaya `logout-all` tetap memenuhi janji
     * idempotennya: akun yang sudah dihapus tidak punya sesi untuk dicabut,
     * jadi jawabannya 204 — bukan 401 karena `bumpTokenVersion` gagal.
     */
    async userIdOf(rawToken: string): Promise<string | null> {
      const row = await refreshTokenRepository.findByHash(tokenService.hashRefreshToken(rawToken));
      if (row === null || row.revokedAt !== null) return null;
      const user = await userRepository.findActiveSessionUser(row.userId);
      return user === null ? null : row.userId;
    },
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
