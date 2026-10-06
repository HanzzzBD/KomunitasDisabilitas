const AWAL = "nawasena:community-draft:";
export const kunciDrafCommunity = (userId: string, jenis: string, id: string) =>
  `${AWAL}${userId}:${jenis}:${id}`;
export function bacaDrafCommunity(kunci: string, max: number): string {
  try {
    const value = localStorage.getItem(kunci);
    return value && value.length <= max ? value : "";
  } catch {
    return "";
  }
}
/** Storage can be unavailable/full; the editor must keep its in-memory draft. */
export function simpanDrafCommunity(kunci: string, value: string): boolean {
  try {
    if (value) localStorage.setItem(kunci, value);
    else localStorage.removeItem(kunci);
    return true;
  } catch {
    return false;
  }
}
export function hapusDrafCommunity(): void {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(AWAL)) localStorage.removeItem(key);
  } catch {
    /* Browser storage is blocked. */
  }
}
