// modules/profiles — kontrol akses data sensitif terpusat (PR-039, SDD §8.2).
//
// MASALAH YANG DIPECAHKAN BUKAN "SIAPA BOLEH MEMBACA". Itu urusan RBAC, dan
// sudah dijawab PR-019. Yang dipecahkan di sini adalah masalah yang tidak
// terlihat oleh RBAC: pembacaan yang SAH tetapi tidak pernah dipertanggungjawabkan.
// Seorang admin yang berhak membuka profil siapa pun tetap harus bisa ditanya
// "kenapa kamu membuka profil orang ini pada 3 Agustus?", dan jawabannya harus
// ada sebelum pertanyaannya muncul.
//
// Karena itu jalur non-pemilik di file ini TIDAK PUNYA BENTUK tanpa alasan:
// `bacaSensitif` menuntut `reason`, menolak yang kosong sebelum satu byte pun
// dibaca, dan menulis jejaknya sendiri. Tidak ada pemanggil yang bisa "lupa"
// mengaudit — bukan karena ada yang mengingatkan, melainkan karena mengaudit
// bukan langkah terpisah yang bisa dilewati.
//
// TIGA JALUR, DAN HANYA TIGA (docs/akses-data-sensitif.md):
//
//   bacaAman()      — bentuk yang secara TIPE tidak punya tempat bagi data
//                     disabilitas. Ini jalur baku; pakai ini kecuali ada alasan
//                     yang bisa ditulis.
//   bacaSensitif()  — pihak LAIN. Wajib alasan, selalu berjejak.
//   profiles.service.snapshotFor() — PEMILIK membaca datanya sendiri. Sengaja
//                     TETAP di berkasnya sendiri alih-alih dipindahkan ke sini:
//                     ia sudah ada sejak PR-037, dipakai `GET /me/profile` dan
//                     kontributor ekspor PDP, dan menyalinnya ke sini akan
//                     membuat DUA cara membaca profil sendiri yang bisa
//                     menyimpang. Kenapa ia tidak beraudit: lihat
//                     `KEBIJAKAN_AUDIT` di bawah.
import {
  AUDIT_ACTION,
  sensitiveAccessReasonSchema,
  type SeekerProfile,
  type SafeProfile,
  type SensitiveAccessPurpose,
} from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import type { FieldCrypto } from "../../../core/crypto/index.js";
import { appError } from "../../../core/http/index.js";
import type { ProfileRepository } from "../repositories/profile.repository.js";
import { AUDIT_ENTITY, FIELD_SENSITIF, keProfil } from "./profiles.service.js";
import type { ProfilesActor } from "./profiles.service.js";

/**
 * Tujuan yang bisa dipakai jalur non-pemilik.
 *
 * `selfService` DIKELUARKAN OLEH TIPE, bukan oleh pemeriksaan. Kalau ia boleh
 * disebut di sini, siapa pun bisa membaca profil orang lain sambil mengaku
 * sedang melayani dirinya sendiri — dan kebijakan "self service tidak dicatat"
 * di bawah berubah dari keringanan yang masuk akal menjadi lubang. Pemilik
 * membaca datanya sendiri lewat `profiles.service.snapshotFor`, yang tidak
 * pernah menerima id dari input.
 */
export type TujuanAksesLain = Exclude<SensitiveAccessPurpose, "selfService">;

/**
 * Cara satu tujuan dicatat.
 *
 * Ditulis sebagai DATA, bukan sebagai cabang `if` yang tersebar, supaya
 * pertanyaan "apa yang tercatat saat matching membaca profil?" bisa dijawab
 * dengan membaca satu tabel — dan supaya tujuan baru tidak bisa lahir tanpa
 * seseorang memilih jawabannya.
 */
export const KEBIJAKAN_AUDIT: Readonly<Record<SensitiveAccessPurpose, "perPanggilan" | "agregat" | "tanpaCatatan">> =
  {
    // Membaca profil sendiri terjadi setiap kali halaman profil dibuka. Satu
    // baris audit per pembukaan halaman akan menenggelamkan pembacaan oleh
    // pihak lain — satu-satunya yang benar-benar perlu ditemukan saat
    // menyelidiki — di bawah ribuan baris yang tidak pernah menarik siapa pun.
    // Dan secara hukum tidak ada yang perlu dipertanggungjawabkan: tidak ada
    // pengungkapan ketika subjek dan pembacanya orang yang sama.
    selfService: "tanpaCatatan",
    support: "perPanggilan",
    disclosure: "perPanggilan",
    // Pencocokan membaca ribuan profil per batch. Satu baris per profil bukan
    // audit melainkan salinan tabel; yang berguna saat menyelidiki adalah
    // "berapa banyak, oleh job mana, hari apa". Sejalan dengan aturan yang
    // sudah tertulis di docs/audit-action-catalog.md: baca massal dicatat
    // per-job, bukan per-record.
    matching: "agregat",
  };

export interface SensitiveAccessDeps {
  profileRepository: ProfileRepository;
  crypto: FieldCrypto;
  auditLog: AuditLog;
  /** Sumber waktu; disuntik test. */
  clock?: () => Date;
}

/** Satu ember agregat: satu hari, satu pelaku. */
interface EmberAgregat {
  hari: string;
  actorId: string;
  /** requestId panggilan PERTAMA di ember ini — lihat catatan di `catatAgregat`. */
  requestId: string;
  reason: string;
  jumlah: number;
}

export function createSensitiveAccess(deps: SensitiveAccessDeps) {
  const { profileRepository, crypto, auditLog } = deps;
  const now = deps.clock ?? (() => new Date());

  /**
   * Ember agregat yang belum ditulis, per `hari|actorId`.
   *
   * DI MEMORI, DAN ITU BATAS YANG NYATA: proses yang mati membawa serta
   * hitungan yang belum sempat ditulis. Yang hilang adalah ANGKA, bukan
   * kejadian — profil tetap terbaca, dan job matching yang menyebabkannya
   * meninggalkan jejaknya sendiri di log job. Menjadikannya tahan-mati menuntut
   * tabel penampung tersendiri, dan itu biaya yang tidak sebanding untuk
   * mengamankan sebuah hitungan.
   */
  const ember = new Map<string, EmberAgregat>();

  const hariIni = (): string => now().toISOString().slice(0, 10);

  const tulis = (
    e: Pick<EmberAgregat, "actorId" | "requestId" | "reason">,
    purpose: SensitiveAccessPurpose,
    entityId: string | null,
    count?: number,
  ): void =>
    auditLog(
      { actorId: e.actorId, requestId: e.requestId },
      AUDIT_ACTION.PROFILE_SENSITIVE_READ,
      AUDIT_ENTITY,
      entityId,
      { purpose, fields: [...FIELD_SENSITIF], reason: e.reason, ...(count === undefined ? {} : { count }) },
    );

  /**
   * Tulis ember yang harinya sudah lewat, lalu tambahkan panggilan ini ke ember
   * hari ini.
   *
   * `entityId` pada baris agregat adalah `null`, dan itu benar: barisnya tidak
   * berbicara tentang satu subjek melainkan tentang satu job. Baris agregat yang
   * menunjuk salah satu subjek secara sembarang akan terbaca sebagai "profil
   * inilah yang dibaca" oleh siapa pun yang menyelidikinya nanti.
   *
   * `requestId` dan `reason` diambil dari panggilan PERTAMA di ember, bukan yang
   * terakhir: keduanya menjawab "apa yang memulai pembacaan massal ini", dan
   * jawaban itu tidak berubah karena batch-nya panjang.
   */
  const catatAgregat = (actor: ProfilesActor, reason: string): void => {
    const hari = hariIni();
    for (const [kunci, isi] of ember) {
      if (isi.hari === hari) continue;
      tulis(isi, "matching", null, isi.jumlah);
      ember.delete(kunci);
    }

    const kunci = `${hari}|${actor.userId}`;
    const ada = ember.get(kunci);
    if (ada === undefined) {
      ember.set(kunci, {
        hari,
        actorId: actor.userId,
        requestId: actor.requestId,
        reason,
        jumlah: 1,
      });
      return;
    }
    ada.jumlah += 1;
  };

  return {
    /**
     * Profil TANPA data sensitif — jalur baku.
     *
     * Tidak menuntut alasan dan tidak menulis audit, karena tidak ada yang
     * perlu dipertanggungjawabkan: yang keluar dari sini adalah data karier
     * biasa. Kekuatannya bukan pada janji melainkan pada `select` di
     * repository — kolom sensitifnya tidak pernah meninggalkan PostgreSQL.
     */
    async bacaAman(userId: string): Promise<SafeProfile | null> {
      return profileRepository.findSafeByUserId(userId);
    },

    /**
     * Profil pengguna LAIN, lengkap. Wajib alasan, selalu berjejak.
     *
     * Alasannya diperiksa LEBIH DULU, sebelum satu byte pun dibaca: permintaan
     * tanpa alasan yang sah harus gagal tanpa pernah menyentuh datanya, bukan
     * gagal setelah membacanya.
     *
     * Audit ditulis MESKI barisnya tidak ada. Percobaan membuka profil yang
     * ternyata kosong tetap percobaan membuka profil seseorang — dan kalau
     * hanya pembacaan yang berhasil yang tercatat, menyisir siapa yang PUNYA
     * data disabilitas menjadi gratis.
     *
     * Otorisasi (siapa yang boleh) BUKAN urusan fungsi ini — pemanggilnya wajib
     * berada di balik `access.role("admin")` atau setara. Yang dijamin di sini
     * hanyalah bahwa pembacaan yang terjadi meninggalkan jejak.
     */
    async bacaSensitif(
      actor: ProfilesActor,
      targetUserId: string,
      opsi: { purpose: TujuanAksesLain; reason: string },
    ): Promise<SeekerProfile | null> {
      const alasan = sensitiveAccessReasonSchema.safeParse(opsi.reason);
      if (!alasan.success) {
        throw appError("ALASAN_AKSES_DIPERLUKAN");
      }

      const kebijakan = KEBIJAKAN_AUDIT[opsi.purpose];
      if (kebijakan === "agregat") catatAgregat(actor, alasan.data);
      else {
        tulis(
          { actorId: actor.userId, requestId: actor.requestId, reason: alasan.data },
          opsi.purpose,
          targetUserId,
        );
      }

      const row = await profileRepository.findSensitiveByUserId(targetUserId);
      return row === null ? null : keProfil(row, crypto);
    },

    /**
     * Tulis seluruh ember agregat yang masih tertahan.
     *
     * Dipanggil saat proses berhenti dengan tertib (dan oleh test). Tanpa ini,
     * hitungan hari berjalan hanya tertulis kalau kebetulan ada pembacaan lagi
     * setelah tengah malam — yaitu tidak pernah, pada job yang berjalan sekali
     * sehari.
     */
    flushAudit(): void {
      for (const [kunci, isi] of ember) {
        tulis(isi, "matching", null, isi.jumlah);
        ember.delete(kunci);
      }
    },

    /** Jumlah pembacaan yang belum tertulis — untuk test dan log shutdown. */
    tertahan(): number {
      let n = 0;
      for (const isi of ember.values()) n += isi.jumlah;
      return n;
    },
  };
}

export type SensitiveAccess = ReturnType<typeof createSensitiveAccess>;
