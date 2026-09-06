// core/events — bus event domain in-process (PR-024b, CLAUDE.md §3.2, ADR-001).
//
// KENAPA ADA SEKARANG, PADAHAL BELUM ADA PELANGGANNYA. Nilainya bukan pesan
// yang dikirim hari ini — hari ini tidak ada yang mendengarkan. Nilainya adalah
// MOMENNYA: penerbit pertama baru saja lahir (job expiry), dan tanpa bus, tiap
// pelanggan yang menyusul akan masuk sebagai panggilan langsung di dalam
// service penerbitnya. Setelah tiga pelanggan, service itu tahu tentang
// notifikasi, cache feed, dan analitik sekaligus — persis kopling yang
// dilarang ADR-001, dibongkar belakangan dengan biaya jauh lebih besar.
//
// TIGA BATAS YANG DITULIS DI SINI SUPAYA TIDAK DITEMUKAN NANTI:
//
//   1. SATU PROSES. "In-process" berarti benar-benar satu proses. Penerbitnya
//      hari ini adalah worker; pelanggan yang kelak hidup di proses API TIDAK
//      akan mendengar apa pun. Event yang harus melintasi proses adalah
//      pekerjaan antrean (BullMQ), bukan bus ini.
//   2. TANPA PERSISTENSI, RETRY, ATAU URUTAN. Event yang terbit saat proses
//      mati memang hilang. Apa pun yang tidak boleh hilang tidak boleh
//      mengandalkan bus ini — ia pemberitahuan, bukan janji.
//   3. PELANGGAN TIDAK PERNAH MENJATUHKAN PENERBIT. Saat `job.closed` terbit,
//      lowongannya SUDAH tertutup di database. Membiarkan pelanggan yang gagal
//      menggagalkan job akan membatalkan pekerjaan yang sudah benar, lalu
//      mengulanginya — dan pengulangan itu menerbitkan event yang sama lagi.
import type {
  ApplicationStatusChangedEvent,
  ApplicationSubmittedEvent,
  JobClosedEvent,
  ProfileUpdatedEvent,
  UserRegisteredEvent,
} from "@nawasena/schemas";
import type { Logger } from "../logger/index.js";

/**
 * Peta event domain → bentuk payload-nya.
 *
 * Ditulis terpusat DENGAN SENGAJA meski berarti core mengenal nama-nama domain:
 * inilah satu-satunya tempat seseorang bisa membaca "event apa saja yang ada di
 * sistem ini". Peta yang dirakit tersebar akan membuat pertanyaan itu hanya
 * bisa dijawab dengan grep.
 */
export interface DomainEvents {
  "job.closed": JobClosedEvent;
  /** Akun baru dibuat (PR-034). Penerbitnya modul auth, DI PROSES API —
   *  jadi pelanggannya pun harus hidup di proses yang sama (batas 1 di atas). */
  "auth.user_registered": UserRegisteredEvent;
  /**
   * Profil karier atau salah satu sub-entitasnya berubah (PR-038). Penerbitnya
   * modul profiles, DI PROSES API. Pelanggan pertamanya belum lahir: perhitungan
   * ulang embedding profil ada di PR-069.
   *
   * Ketika pelanggan itu lahir, batas 2 di atas menjadi penting — event yang
   * hilang saat proses mati berarti embedding yang tidak pernah dihitung ulang,
   * dan tidak ada yang akan mencobanya lagi. Konsumen PR-069 karena itu harus
   * berupa job antrean yang DIPICU event ini, bukan pekerjaan yang dilakukan di
   * dalam handler-nya.
   */
  "profile.updated": ProfileUpdatedEvent;
  /**
   * Lamaran baru terkirim (PR-076). PELANGGANNYA SUDAH ADA — notifikasi in-app
   * (PR-047) — sedangkan PENERBITNYA belum: modul `applications` lahir di
   * Phase 12. Urutan itu disengaja dan tidak berbahaya: `emit` yang tidak
   * pernah dipanggil tidak melahirkan apa pun, dan pelanggan yang sudah
   * terpasang lebih dulu berarti penerbitnya kelak tidak perlu menyentuh satu
   * baris pun di modul notifications.
   *
   * Penerbitnya harus hidup DI PROSES API (batas 1 di atas). Lamaran dikirim
   * lewat permintaan HTTP, jadi ini terpenuhi dengan sendirinya — tetapi bila
   * suatu saat pengiriman dipindah ke worker, notifikasinya diam-diam berhenti.
   */
  "application.submitted": ApplicationSubmittedEvent;
  /**
   * Status pipeline lamaran berpindah (PR-078). Pelanggan pertamanya PR-047.
   *
   * Batas 2 di atas berlaku penuh di sini dan pantas dibaca dua kali: event yang
   * hilang saat proses mati berarti notifikasi yang TIDAK PERNAH ada, dan
   * pengguna tidak punya cara mengetahui bahwa ia kehilangan sesuatu. Yang
   * menahannya hari ini adalah bahwa statusnya sendiri tetap benar di DB dan
   * tetap terbaca di layar lamaran. Bila kelak notifikasi menjadi satu-satunya
   * kabar (mis. sesudah email PR-049), kabar itu harus lahir dari job antrean
   * yang dipicu event ini — bukan dari handler-nya.
   */
  "application.status_changed": ApplicationStatusChangedEvent;
}

export type DomainEventName = keyof DomainEvents;

/** Pelanggan boleh async; nilai baliknya tidak pernah ditunggu penerbit. */
export type EventHandler<K extends DomainEventName> = (
  payload: DomainEvents[K],
) => void | Promise<void>;

export interface EventBus {
  /**
   * Terbitkan event. TIDAK melempar dan tidak mengembalikan apa pun —
   * penerbit tidak boleh punya cara mengetahui apakah ada yang mendengarkan,
   * apalagi bergantung padanya.
   */
  emit<K extends DomainEventName>(nama: K, payload: DomainEvents[K]): void;
  /** Berlangganan; kembaliannya membatalkan langganan. */
  on<K extends DomainEventName>(nama: K, handler: EventHandler<K>): () => void;
  /** Jumlah pelanggan per event — untuk log boot & test. */
  jumlahPelanggan(nama: DomainEventName): number;
}

export interface EventBusDeps {
  logger: Pick<Logger, "error">;
}

export function createEventBus(deps: EventBusDeps): EventBus {
  const pelanggan = new Map<DomainEventName, Array<EventHandler<DomainEventName>>>();

  return {
    on(nama, handler) {
      const daftar = pelanggan.get(nama) ?? [];
      daftar.push(handler as EventHandler<DomainEventName>);
      pelanggan.set(nama, daftar);

      return () => {
        const sekarang = pelanggan.get(nama);
        if (sekarang === undefined) return;
        const posisi = sekarang.indexOf(handler as EventHandler<DomainEventName>);
        if (posisi !== -1) sekarang.splice(posisi, 1);
      };
    },

    emit(nama, payload) {
      const daftar = pelanggan.get(nama);
      if (daftar === undefined || daftar.length === 0) return;

      // Disalin sebelum diiterasi: pelanggan yang membatalkan langganannya
      // sendiri di dalam handler tidak boleh menggeser daftar yang sedang
      // berjalan dan membuat pelanggan berikutnya terlewat.
      for (const handler of [...daftar]) {
        try {
          const hasil = handler(payload);
          // Handler async: kegagalannya datang sebagai promise yang ditolak,
          // dan tanpa `.catch` ia menjadi unhandled rejection yang bisa
          // menjatuhkan proses — kegagalan pelanggan menjatuhkan SEMUANYA.
          if (hasil instanceof Promise) hasil.catch((err: unknown) => laporkan(nama, err));
        } catch (err) {
          laporkan(nama, err);
        }
      }
    },

    jumlahPelanggan(nama) {
      return pelanggan.get(nama)?.length ?? 0;
    },
  };

  function laporkan(nama: DomainEventName, err: unknown): void {
    // `error`, bukan `warn`: pelanggan yang gagal berarti ada akibat yang
    // seharusnya terjadi dan tidak terjadi — dan tidak ada yang akan
    // mencobanya lagi.
    deps.logger.error({ event: nama, err }, "Pelanggan event domain gagal");
  }
}
