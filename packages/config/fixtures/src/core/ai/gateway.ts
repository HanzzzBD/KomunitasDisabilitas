// core/ai — SATU-SATUNYA tempat SDK AI boleh diimpor (AI Gateway, ADR-012).
// VALID: impor SDK eksternal di sini diizinkan — ketiganya, bukan hanya satu.
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import OpenAI from "openai";

export function createGateway(apiKey: string): GoogleGenerativeAI {
  return new GoogleGenerativeAI(apiKey);
}

export function createGatewayCadangan(apiKey: string): Groq {
  return new Groq({ apiKey });
}

export function createGatewayLain(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}
