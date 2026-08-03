// Konvensi query key TanStack Query: [domain, params] (ADR-014).
// Helper murni tanpa dependensi @tanstack/react-query — paket TQ dipasang di
// apps; konvensi key cukup array biasa.

/** Params di-normalisasi: urutan key stabil, nilai undefined dibuang. */
export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export type QueryKey = readonly [domain: string, params?: Readonly<Record<string, unknown>>];

/**
 * queryKey("jobs", { q: "kasir", page: 2 }) → ["jobs", { page: 2, q: "kasir" }]
 * Deterministik: dua pemanggilan dengan params sama (beda urutan) menghasilkan
 * key ber-serialisasi identik — cache TanStack tidak pecah.
 */
export function queryKey(domain: string, params?: QueryParams): QueryKey {
  if (params === undefined) return [domain];
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value !== undefined) normalized[key] = value;
  }
  return [domain, normalized];
}
