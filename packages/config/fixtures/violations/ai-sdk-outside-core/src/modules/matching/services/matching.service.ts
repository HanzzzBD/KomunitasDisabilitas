// PELANGGARAN 2: impor SDK AI langsung di service (bukan core/ai).
// Bypass AI Gateway → boundaries/external error (ADR-012).
//
// KETIGA SDK yang dilarang disebut sekaligus (PR-046 AC-3). Menguji satu saja
// membiarkan dua pintu lain terbuka: aturannya mendaftar tiga penentu, dan
// penentu yang tidak pernah diuji adalah penentu yang bisa hilang dari daftar
// tanpa satu pun test berubah warna.
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import OpenAI from "openai";

export const matchingService = {
  rank: (key: string) => new GoogleGenerativeAI(key),
  rankGroq: (key: string) => new Groq({ apiKey: key }),
  rankOpenAI: (key: string) => new OpenAI({ apiKey: key }),
};
