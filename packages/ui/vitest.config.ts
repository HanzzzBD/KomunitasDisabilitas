// Komponen dirender di jsdom, dan setiap komponen wajib melewati gerbang axe
// (PR-031a). Konfigurasi ini yang membuat keduanya mungkin.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./__tests__/setup.ts"],
    fileParallelism: false,
  },
});
