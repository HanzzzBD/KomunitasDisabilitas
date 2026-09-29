// Tabel `ai_chat_sessions` di memori — kontrak `ChatSessionsRepository` yang
// sama dengan repository Prisma (PR-065/066/067).
//
// Yang TIDAK dibuktikannya: konkurensi (kunci baris `UPDATE`), unique parsial,
// batas byte — itu milik PostgreSQL dan diuji di `ai-chat-sessions-db.test.ts`.
// Transisi status di sini meniru `WHERE status = …` repository aslinya, supaya
// test service/HTTP melihat penolakan yang sama.
import type { AiChatTurn } from "@nawasena/schemas";
import type { ChatSessionRow, ChatSessionsRepository } from "../../src/modules/ai/index.js";

export type BarisMemori = ChatSessionRow & { userId: string };

export function repoSesiMemori(): ChatSessionsRepository & { baris: Map<string, BarisMemori> } {
  const baris = new Map<string, BarisMemori>();
  const salin = (b: BarisMemori): ChatSessionRow => {
    const { userId: _u, ...sisa } = b;
    return { ...sisa, transcript: [...b.transcript] };
  };
  const terbuka = (u: string) =>
    [...baris.values()].find(
      (b) => b.userId === u && (b.status === "active" || b.status === "finalizing"),
    );
  const milik = (u: string, id: string) => {
    const b = baris.get(id);
    return b !== undefined && b.userId === u ? b : undefined;
  };

  return {
    baris,
    findOwned: (u, id) => {
      const b = milik(u, id);
      return Promise.resolve(b === undefined ? null : salin(b));
    },
    findActive: (u) => {
      const b = terbuka(u);
      return Promise.resolve(b === undefined ? null : salin(b));
    },
    createOrGetActive: (u, id, now) => {
      const ada = terbuka(u);
      if (ada !== undefined) return Promise.resolve({ row: salin(ada), baru: false });
      const b: BarisMemori = {
        userId: u,
        id,
        status: "active",
        transcript: [],
        createdAt: now,
        updatedAt: now,
        finalizedAt: null,
        resumeId: null,
        extractionFailedAt: null,
        extractionError: null,
      };
      baris.set(id, b);
      return Promise.resolve({ row: salin(b), baru: true });
    },
    appendTurn: (u, id, g, batas) => {
      const b = milik(u, id);
      if (b === undefined)
        return Promise.resolve({ ok: false as const, sebab: "tidak-ada" as const });
      if (b.status === "finalizing") {
        return Promise.resolve({ ok: false as const, sebab: "diproses" as const });
      }
      if (b.status !== "active")
        return Promise.resolve({ ok: false as const, sebab: "selesai" as const });
      if (b.transcript.length >= batas.maxTurns) {
        return Promise.resolve({ ok: false as const, sebab: "penuh" as const });
      }
      const turn: AiChatTurn = {
        seq: b.transcript.length + 1,
        role: g.role,
        content: g.content,
        at: g.at.toISOString(),
      };
      b.transcript.push(turn);
      b.updatedAt = g.at;
      return Promise.resolve({ ok: true as const, turn });
    },
    listForExport: (u) =>
      Promise.resolve([...baris.values()].filter((b) => b.userId === u).map(salin)),
    countRetention: () => Promise.resolve(0),
    deleteRetentionBatch: () => Promise.resolve(0),
    mulaiFinalisasi: (u, id, now) => {
      const b = milik(u, id);
      if (b === undefined) return Promise.resolve("tidak-ada" as const);
      if (b.status === "finalizing") return Promise.resolve("diproses" as const);
      if (b.status === "finalized") return Promise.resolve("selesai" as const);
      Object.assign(b, {
        status: "finalizing",
        updatedAt: now,
        extractionFailedAt: null,
        extractionError: null,
      });
      return Promise.resolve("ok" as const);
    },
    batalFinalisasi: (u, id, now) => {
      const b = milik(u, id);
      if (b?.status !== "finalizing") return Promise.resolve(false);
      Object.assign(b, { status: "active", updatedAt: now });
      return Promise.resolve(true);
    },
    selesaiFinalisasi: (u, id, resumeId, now) => {
      const b = milik(u, id);
      if (b?.status !== "finalizing") return Promise.resolve(false);
      Object.assign(b, { status: "finalized", finalizedAt: now, resumeId, updatedAt: now });
      return Promise.resolve(true);
    },
    gagalFinalisasi: (u, id, kode, now) => {
      const b = milik(u, id);
      if (b?.status !== "finalizing") return Promise.resolve(false);
      Object.assign(b, {
        status: "active",
        extractionFailedAt: now,
        extractionError: kode,
        updatedAt: now,
      });
      return Promise.resolve(true);
    },
  };
}
