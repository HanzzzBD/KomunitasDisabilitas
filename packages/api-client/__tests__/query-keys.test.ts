import { describe, it, expect } from "vitest";
import { queryKey } from "../src/index.js";

describe("queryKey [domain, params] (ADR-014)", () => {
  it("tanpa params → [domain]", () => {
    expect(queryKey("jobs")).toEqual(["jobs"]);
  });

  it("deterministik: urutan key params tidak mempengaruhi hasil", () => {
    const a = queryKey("jobs", { q: "kasir", page: 2 });
    const b = queryKey("jobs", { page: 2, q: "kasir" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("nilai undefined dibuang, null dipertahankan", () => {
    expect(queryKey("jobs", { q: undefined, cursor: null })).toEqual(["jobs", { cursor: null }]);
  });
});
