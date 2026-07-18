// PELANGGARAN 2: impor SDK AI langsung di service (bukan core/ai).
// Bypass AI Gateway → boundaries/external error (ADR-012).
import { GoogleGenerativeAI } from "@google/generative-ai";

export const matchingService = {
  rank: (key: string) => new GoogleGenerativeAI(key),
};
