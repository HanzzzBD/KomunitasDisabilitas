import { createHash } from "node:crypto";
import type { Resume } from "@nawasena/schemas";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

/** Hash atas seluruh data yang memengaruhi halaman PDF. */
export function resumeRenderHash(resume: Pick<Resume, "title" | "content">): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical({ title: resume.title, content: resume.content })), "utf8")
    .digest("hex");
}
