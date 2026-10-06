import type { Community } from "@nawasena/schemas";

export const COMMUNITY_UJI: Community = {
  id: "01912345-89ab-7def-8123-4567890acc01",
  slug: "persiapan-karier",
  name: "Persiapan karier",
  description:
    "Ruang berbagi pengalaman menyiapkan CV dan wawancara kerja. Saling bantu dengan bahasa yang sopan.",
  type: "topic",
  city: null,
  status: "active",
  memberCount: 12,
  membershipStatus: null,
  createdAt: "2026-10-06T06:00:00.000Z",
  updatedAt: "2026-10-06T06:00:00.000Z",
};
export const COMMUNITY_KOTA_UJI: Community = {
  ...COMMUNITY_UJI,
  id: "01912345-89ab-7def-8123-4567890acc02",
  slug: "karier-jakarta",
  name: "Karier Jakarta",
  description:
    "Kenali pengalaman kerja di Jakarta dan berbagi informasi seputar karier di kota ini.",
  type: "city",
  city: "Jakarta",
  memberCount: 8,
};
