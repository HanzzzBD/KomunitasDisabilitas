// Fixture bus event domain (PR-024b, dipakai luas sejak PR-034).
//
// Sejak modul auth menerbitkan `auth.user_registered`, `events` menjadi
// dependensi WAJIB `createAuthModule` — dan itu memang disengaja (lihat
// AuthModuleDeps). Helper ini menyediakan bus nyata seukuran test untuk berkas
// yang tidak sedang menguji event sama sekali: tanpa pelanggan, `emit` menjadi
// no-op yang tetap bertipe benar, bukan tiruan yang bisa menyimpang dari bus
// sungguhan.
//
// Berkas yang MENGUJI penerbitannya (auth-otp, auth-google-exchange) memakai
// mata-mata `vi.fn()` sendiri — di sanalah yang diperiksa memang emit-nya.
import { createEventBus, type EventBus } from "../../src/core/events/index.js";

export function busUji(): EventBus {
  // Kegagalan pelanggan dibuang: test yang memakai helper ini tidak punya
  // pelanggan sama sekali, jadi tidak ada yang bisa gagal.
  return createEventBus({ logger: { error: () => {} } });
}
