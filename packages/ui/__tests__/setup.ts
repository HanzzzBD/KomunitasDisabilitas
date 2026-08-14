// Matcher yang membaca DOM sebagaimana pengguna melihatnya (`toBeVisible`,
// `toHaveAccessibleName`) — bukan sekadar "elemen ini ada di pohon". Bedanya
// menentukan di paket ini: elemen yang hadir tetapi tersembunyi dari screen
// reader adalah cacat, bukan keberhasilan.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom tidak mengimplementasikan Pointer Capture, `scrollIntoView`, maupun
// `ResizeObserver` — tiga hal yang dipakai Radix Select untuk menempatkan dan
// menggulirkan daftarnya. Tanpa tambalan di bawah, komponennya melempar sebelum
// satu assertion pun berjalan.
//
// Yang ditambal SELURUHNYA soal tata letak dan penunjuk; tidak satu pun
// menyentuh peran, id, atau penanganan keyboard. Artinya test yang lolos di
// sini benar-benar menguji perilaku Radix, bukan menguji tambalan ini.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
