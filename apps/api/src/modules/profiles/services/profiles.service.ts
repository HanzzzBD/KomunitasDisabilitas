// modules/profiles — service profil pencari kerja (PR-037, SDD §6.2, ADR-007).
//
// SATU-SATUNYA tempat di seluruh repo tempat data disabilitas berbentuk
// plaintext. Di atasnya (controller, router) yang mengalir adalah kontrak API;
// di bawahnya (repository, DB) yang tersimpan adalah ciphertext. Kalau kelak
// ada pertanyaan "di mana data disabilitas bisa terbaca?", jawabannya harus
// tetap: file ini, dan tidak ada yang lain.
//
// Aturan yang mengikat seluruh file, sama dengan `modules/users` dan
// `modules/accessibility`: userId SELALU datang dari sesi, TIDAK PERNAH dari
// input. Tidak ada satu pun fungsi di sini yang punya parameter untuk menyebut
// pengguna lain — bukan pemeriksaan yang bisa lupa dipasang, melainkan saluran
// yang tidak ada. Akses non-pemilik (support, matching) lahir di PR-039 lewat
// jalur tersendiri yang wajib menyertakan alasan.
import {
  ACCOMMODATION_NEEDS_KOSONG,
  AUDIT_ACTION,
  SEEKER_PROFILE_KOSONG,
  type AccommodationNeeds,
  type DisabilityType,
  type SeekerProfile,
  type UpdateSeekerProfile,
} from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import type { EventBus } from "../../../core/events/index.js";
import type { FieldCrypto } from "../../../core/crypto/index.js";
import { appError } from "../../../core/http/index.js";
import type {
  ProfileRepository,
  SeekerProfilePatch,
  SeekerProfileRow,
} from "../repositories/profile.repository.js";

/** Entitas audit modul ini (tanpa PII). */
const AUDIT_ENTITY = "profiles.seeker";

/** Konteks pemanggil — bentuknya sama dengan `UsersActor` (PR-020). */
export interface ProfilesActor {
  userId: string;
  requestId: string;
}

export interface ProfilesServiceDeps {
  profileRepository: ProfileRepository;
  /** Pintu enkripsi field (core/crypto). Kuncinya divalidasi saat boot. */
  crypto: FieldCrypto;
  auditLog: AuditLog;
  /**
   * Bus event domain (PR-038). Dipakai untuk menerbitkan `profile.updated` —
   * pemicu perhitungan ulang embedding di PR-069.
   */
  events: EventBus;
  /** Sumber waktu; disuntik test. */
  clock?: () => Date;
}

/** Nama field sensitif — dipakai patch DB dan meta audit sekaligus. */
const FIELD_SENSITIF = ["disabilityTypes", "accommodationNeeds"] as const;
type FieldSensitif = (typeof FIELD_SENSITIF)[number];

/**
 * Baris DB → kontrak API, dengan dekripsi.
 *
 * CONSENT MENANG ATAS ISI KOLOM. Bila `consentSensitiveAt` null, `sensitive`
 * dijawab `null` TANPA menyentuh ciphertext-nya sama sekali — meski kolomnya
 * kebetulan masih terisi. Pencabutan consent memang menghapus kedua kolom
 * (lihat `updateMe`), jadi keadaan itu seharusnya tidak ada; "seharusnya tidak
 * ada" adalah alasan yang tepat untuk membuat jalur bacanya buntu, bukan alasan
 * untuk mempercayainya.
 *
 * Pemetaan eksplisit, bukan spread: andai repository kelak ikut membawa kolom
 * baru, kolom itu tetap tidak punya jalan keluar dari sini.
 */
function keProfil(row: SeekerProfileRow, crypto: FieldCrypto): SeekerProfile {
  const aman = {
    headline: row.headline,
    summary: row.summary,
    city: row.city,
    province: row.province,
    openToRemote: row.openToRemote,
    disclosureDefault: row.disclosureDefault,
    consentSensitiveAt: row.consentSensitiveAt?.toISOString() ?? null,
  };

  if (row.consentSensitiveAt === null) return { ...aman, sensitive: null };

  return {
    ...aman,
    sensitive: {
      // Kolom kosong = consent sudah diberikan tetapi belum ada yang diisi.
      // Itu keadaan yang wajar (formulir dibuka, belum disimpan), jadi bentuk
      // kosongnya harus sama dengan bentuk terisi — UI tidak perlu cabang.
      disabilityTypes:
        row.disabilityTypes === null ? [] : crypto.decryptJson<DisabilityType[]>(row.disabilityTypes),
      accommodationNeeds:
        row.accommodationNeeds === null
          ? { ...ACCOMMODATION_NEEDS_KOSONG }
          : crypto.decryptJson<AccommodationNeeds>(row.accommodationNeeds),
    },
  };
}

export function createProfilesService(deps: ProfilesServiceDeps) {
  const { profileRepository, crypto, auditLog, events } = deps;
  const now = deps.clock ?? (() => new Date());

  /**
   * Profil pemilik TANPA konteks permintaan — dipakai kontributor ekspor PDP
   * (`profile-export.service.ts`) dan `getMe` di bawah.
   *
   * Ada supaya kontributor tidak perlu MENGARANG `requestId` demi memenuhi
   * bentuk `ProfilesActor`. Id permintaan karangan akan tampak sah di jejak mana
   * pun ia muncul, dan jejak yang menunjuk permintaan yang tidak pernah ada
   * lebih buruk daripada jejak yang tidak ada.
   */
  async function snapshotFor(userId: string): Promise<SeekerProfile> {
    const row = await profileRepository.findByUserId(userId);
    if (row === null) return { ...SEEKER_PROFILE_KOSONG };
    return keProfil(row, crypto);
  }

  return {
    /**
     * GET /me/profile — profil pemilik sesi.
     *
     * Baris yang belum ada BUKAN kesalahan: profil lahir saat pertama kali
     * disimpan, tidak saat registrasi. Yang dijawab adalah
     * `SEEKER_PROFILE_KOSONG`, yang isinya sama persis dengan baris yang akan
     * lahir dari PUT pertama — jadi pengguna tidak pernah melihat dua tampilan
     * berbeda tanpa mengubah apa pun.
     *
     * TIDAK menulis apa pun, dan TIDAK menulis audit. Membaca profil sendiri
     * adalah hal yang dilakukan setiap kali halaman dibuka; mencatatnya akan
     * menenggelamkan `PROFILE_SENSITIVE_READ` yang memang perlu jarang —
     * pembacaan oleh pihak LAIN, yang lahir di PR-039.
     */
    getMe(actor: ProfilesActor): Promise<SeekerProfile> {
      return snapshotFor(actor.userId);
    },

    snapshotFor,

    /**
     * PUT /me/profile — simpan perubahan sebagian.
     *
     * Tiga hal terjadi di sini, dan urutannya penting:
     *
     *   1. Patch dirakit; field sensitif DIENKRIPSI sebelum meninggalkan
     *      fungsi ini.
     *   2. Repository menulis di bawah penjaga consent (satu transaksi).
     *      Menulis field sensitif tanpa consent yang berlaku → 403.
     *   3. Audit ditulis SETELAH tulisan berhasil — jejak yang mendahului
     *      perubahan akan berbohong setiap kali transaksinya gagal.
     */
    async updateMe(actor: ProfilesActor, input: UpdateSeekerProfile): Promise<SeekerProfile> {
      const sebelum = await profileRepository.findByUserId(actor.userId);
      const patch: SeekerProfilePatch = {};

      if (input.headline !== undefined) patch.headline = input.headline;
      if (input.summary !== undefined) patch.summary = input.summary;
      if (input.city !== undefined) patch.city = input.city;
      if (input.province !== undefined) patch.province = input.province;
      if (input.openToRemote !== undefined) patch.openToRemote = input.openToRemote;
      if (input.disclosureDefault !== undefined) patch.disclosureDefault = input.disclosureDefault;

      // --- Consent -------------------------------------------------------
      // Memberi consent yang SUDAH ada tidak memperbarui waktunya: yang
      // dituntut UU PDP adalah bukti kapan seseorang MULAI menyetujui, dan
      // menimpanya setiap kali formulir disimpan akan menghapus bukti itu
      // sedikit demi sedikit sampai tanggalnya menjadi "kemarin" selamanya.
      const consentSebelum = sebelum?.consentSensitiveAt ?? null;
      const memberiConsent = input.consentSensitive === true && consentSebelum === null;
      // Ciphertext yang tertinggal tanpa consent seharusnya tidak ada — tetapi
      // bila ada, pencabutan yang menghapusnya adalah peristiwa yang HARUS
      // tercatat. Audit yang hanya melihat kolom consent akan diam persis pada
      // kasus yang paling perlu dijelaskan.
      const adaDataSensitif =
        (sebelum?.disabilityTypes ?? null) !== null || (sebelum?.accommodationNeeds ?? null) !== null;
      const mencabutConsent =
        input.consentSensitive === false && (consentSebelum !== null || adaDataSensitif);

      if (memberiConsent) patch.consentSensitiveAt = now();
      if (input.consentSensitive === false) {
        // Pencabutan SELALU menghapus kedua kolom, bahkan bila consent-nya
        // memang sudah tidak ada. Permintaan "cabut" harus berakhir pada
        // keadaan "tidak ada data disabilitas di sini" — bukan pada keadaan
        // "tidak ada yang perlu dilakukan".
        patch.consentSensitiveAt = null;
        patch.disabilityTypes = null;
        patch.accommodationNeeds = null;
      }

      // --- Field sensitif ------------------------------------------------
      // `null` = perintah hapus, dan menghapus tidak butuh izin menyimpan.
      // Nilai non-null = menyimpan, dan itulah yang dijaga.
      const ditulis: FieldSensitif[] = [];
      if (input.disabilityTypes !== undefined) {
        patch.disabilityTypes =
          input.disabilityTypes === null ? null : crypto.encryptJson(input.disabilityTypes);
        if (input.disabilityTypes !== null) ditulis.push("disabilityTypes");
      }
      if (input.accommodationNeeds !== undefined) {
        patch.accommodationNeeds =
          input.accommodationNeeds === null ? null : crypto.encryptJson(input.accommodationNeeds);
        if (input.accommodationNeeds !== null) ditulis.push("accommodationNeeds");
      }

      const hasil = await profileRepository.upsertByUserId(actor.userId, patch, {
        butuhConsent: ditulis.length > 0,
      });
      if (!hasil.ok) throw appError("CONSENT_SENSITIF_DIPERLUKAN");

      // --- Audit ---------------------------------------------------------
      // Satu permintaan boleh menghasilkan DUA baris (mis. memberi consent
      // sekaligus mengisi data). Keduanya berbagi `requestId`, jadi tetap bisa
      // dibaca sebagai satu peristiwa — sementara masing-masing tetap bisa
      // dicari sendiri saat pertanyaannya "kapan ia menyetujui?" atau "kapan
      // isinya berubah?".
      const catat = (
        operation: "consentGranted" | "consentRevoked" | "fieldsUpdated",
        fields: readonly FieldSensitif[],
      ) =>
        auditLog(
          { actorId: actor.userId, requestId: actor.requestId },
          AUDIT_ACTION.PROFILE_SENSITIVE_UPDATED,
          AUDIT_ENTITY,
          actor.userId,
          { operation, fields: [...fields] },
        );

      if (memberiConsent) catat("consentGranted", []);
      if (mencabutConsent) catat("consentRevoked", FIELD_SENSITIF);
      if (ditulis.length > 0) catat("fieldsUpdated", ditulis);

      // --- Event ---------------------------------------------------------
      // SETIAP permintaan yang sampai di sini menerbitkan `profile.updated`,
      // termasuk yang badannya kosong. Membandingkan "sebelum" dan "sesudah"
      // untuk menekan event yang tidak mengubah apa pun terdengar rapi, tetapi
      // perbandingan itu harus ikut menyertakan kolom terenkripsi — yang berarti
      // mendekripsi dua kali demi menghemat satu pesan yang pelanggannya memang
      // idempoten (PR-069 menghitung ulang embedding dari keadaan terkini,
      // bukan dari isi event).
      events.emit("profile.updated", {
        userId: actor.userId,
        section: "profile",
        updatedAt: now().toISOString(),
      });

      return keProfil(hasil.row, crypto);
    },
  };
}

export type ProfilesService = ReturnType<typeof createProfilesService>;
