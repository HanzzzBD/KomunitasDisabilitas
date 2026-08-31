// PR-042 — mesin keadaan circuit breaker (AC-2, SDD §7.1).
//
// JAM DISUNTIK, BUKAN `vi.useFakeTimers()`. Dua alasan: pola `clock?: () => Date`
// adalah konvensi repo ini, dan modul `core/ai` sudah menghindari fake timer
// karena `AbortSignal.timeout` tidak menghormatinya. Waktu di sini adalah
// variabel biasa yang kita majukan sendiri — tidak ada timer yang perlu dipercaya.
import { describe, it, expect } from "vitest";
import {
  createCircuitBreaker,
  BREAKER_AMBANG_BAKU,
  BREAKER_JENDELA_BUKA_MS,
} from "../src/core/ai/breaker.js";

/** Jam yang dikendalikan test: `maju(ms)` memindahkan waktu ke depan. */
function jamUji(mulai = 1_700_000_000_000) {
  let sekarang = mulai;
  return {
    clock: (): Date => new Date(sekarang),
    maju(ms: number): void {
      sekarang += ms;
    },
  };
}

describe("createCircuitBreaker — ambang & jendela baku", () => {
  it("bakunya 5 kesalahan dan 60 detik, sesuai SDD §7.1", () => {
    expect(BREAKER_AMBANG_BAKU).toBe(5);
    expect(BREAKER_JENDELA_BUKA_MS).toBe(60_000);
  });
});

describe("createCircuitBreaker — closed → open", () => {
  it("empat kegagalan BELUM membuka: sirkuit masih melewatkan panggilan", () => {
    const jam = jamUji();
    const breaker = createCircuitBreaker({ clock: jam.clock });

    for (let i = 0; i < 4; i += 1) breaker.recordFailure();

    expect(breaker.state()).toBe("closed");
    expect(breaker.canAttempt()).toBe(true);
  });

  it("kegagalan KELIMA membuka sirkuit", () => {
    const jam = jamUji();
    const breaker = createCircuitBreaker({ clock: jam.clock });

    for (let i = 0; i < 5; i += 1) breaker.recordFailure();

    expect(breaker.state()).toBe("open");
    expect(breaker.canAttempt()).toBe(false);
  });

  it("hitungannya BERTURUT-TURUT: satu keberhasilan mengulangnya dari nol", () => {
    // Kegagalan yang tersebar bukan tanda provider tumbang. Kalau hitungannya
    // tidak direset, provider yang jelas-jelas menjawab tetap akan diputus.
    const jam = jamUji();
    const breaker = createCircuitBreaker({ clock: jam.clock });

    for (let i = 0; i < 4; i += 1) breaker.recordFailure();
    breaker.recordSuccess();
    for (let i = 0; i < 4; i += 1) breaker.recordFailure();

    expect(breaker.state()).toBe("closed");
    expect(breaker.canAttempt()).toBe(true);
  });
});

describe("createCircuitBreaker — open → half-open", () => {
  it("sebelum 60 detik tetap tertutup rapat, tanpa menyentuh provider", () => {
    const jam = jamUji();
    const breaker = createCircuitBreaker({ clock: jam.clock });
    for (let i = 0; i < 5; i += 1) breaker.recordFailure();

    jam.maju(59_999);

    expect(breaker.canAttempt()).toBe(false);
    expect(breaker.state()).toBe("open");
  });

  it("setelah 60 detik menjadi half-open dan mengizinkan TEPAT SATU penjajakan", () => {
    const jam = jamUji();
    const breaker = createCircuitBreaker({ clock: jam.clock });
    for (let i = 0; i < 5; i += 1) breaker.recordFailure();

    jam.maju(60_000);

    // Penjajak pertama lolos…
    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.state()).toBe("half-open");
    // …dan yang berikutnya tidak. Tanpa batas ini, seluruh trafik yang tertahan
    // akan menyerbu provider yang belum tentu pulih pada detik ke-60.
    expect(breaker.canAttempt()).toBe(false);
    expect(breaker.canAttempt()).toBe(false);
  });
});

describe("createCircuitBreaker — hasil penjajakan menentukan", () => {
  it("penjajakan BERHASIL menutup sirkuit sepenuhnya", () => {
    const jam = jamUji();
    const breaker = createCircuitBreaker({ clock: jam.clock });
    for (let i = 0; i < 5; i += 1) breaker.recordFailure();
    jam.maju(60_000);
    breaker.canAttempt();

    breaker.recordSuccess();

    expect(breaker.state()).toBe("closed");
    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.canAttempt()).toBe(true);
  });

  it("penjajakan GAGAL membuka lagi — tanpa menunggu 5 kegagalan baru", () => {
    const jam = jamUji();
    const breaker = createCircuitBreaker({ clock: jam.clock });
    for (let i = 0; i < 5; i += 1) breaker.recordFailure();
    jam.maju(60_000);
    breaker.canAttempt();

    breaker.recordFailure();

    expect(breaker.state()).toBe("open");
    expect(breaker.canAttempt()).toBe(false);
  });

  it("penjajakan gagal menghitung ulang jendela 60 detik DARI SEKARANG", () => {
    // Kalau jendelanya diteruskan dari pembukaan lama, penjajakan berikutnya
    // akan lolos seketika dan breaker berubah jadi hiasan.
    const jam = jamUji();
    const breaker = createCircuitBreaker({ clock: jam.clock });
    for (let i = 0; i < 5; i += 1) breaker.recordFailure();
    jam.maju(60_000);
    breaker.canAttempt();
    breaker.recordFailure();

    jam.maju(59_999);
    expect(breaker.canAttempt()).toBe(false);

    jam.maju(1);
    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.state()).toBe("half-open");
  });
});

describe("createCircuitBreaker — ambang yang disetel", () => {
  it("menghormati threshold & openMs yang diberikan", () => {
    const jam = jamUji();
    const breaker = createCircuitBreaker({ threshold: 2, openMs: 1_000, clock: jam.clock });

    breaker.recordFailure();
    expect(breaker.canAttempt()).toBe(true);
    breaker.recordFailure();
    expect(breaker.canAttempt()).toBe(false);

    jam.maju(1_000);
    expect(breaker.canAttempt()).toBe(true);
  });
});
