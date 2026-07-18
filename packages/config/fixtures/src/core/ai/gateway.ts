// core/ai — SATU-SATUNYA tempat SDK AI boleh diimpor (AI Gateway, ADR-012).
// VALID: impor SDK eksternal di sini diizinkan.
import { GoogleGenerativeAI } from "@google/generative-ai";

export function createGateway(apiKey: string): GoogleGenerativeAI {
  return new GoogleGenerativeAI(apiKey);
}
