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
