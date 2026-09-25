import puppeteer from "puppeteer-core";
import type { ResumePdfRenderer } from "@nawasena/api/modules/resumes";

export interface PuppeteerPdfRendererOptions {
  executablePath: string;
  launchTimeoutMs?: number;
  pageTimeoutMs?: number;
}

/** Adapter Chromium; satu browser per job agar crash/kebocoran tidak menumpuk. */
export function createPuppeteerPdfRenderer(
  options: PuppeteerPdfRendererOptions,
): ResumePdfRenderer {
  return {
    async render(html) {
      const browser = await puppeteer.launch({
        executablePath: options.executablePath,
        headless: true,
        timeout: options.launchTimeoutMs ?? 20_000,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
        ],
      });

      try {
        const page = await browser.newPage();
        await page.setJavaScriptEnabled(false);
        await page.setContent(html, {
          waitUntil: "load",
          timeout: options.pageTimeoutMs ?? 30_000,
        });
        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
          tagged: true,
          outline: true,
          // Launch (20 dtk) + setContent (30 dtk) + PDF (30 dtk) tetap di
          // bawah timeout queue 90 dtk, sehingga retry tidak tumpang-tindih
          // dengan Chromium lama yang masih bekerja.
          timeout: options.pageTimeoutMs ?? 30_000,
        });

        // Browser adalah boundary eksternal. Jangan terima byte arbitrer
        // sebagai PDF hanya karena pemanggilan tidak melempar.
        if (new TextDecoder().decode(pdf.subarray(0, 5)) !== "%PDF-") {
          throw new Error("Chromium mengembalikan keluaran yang bukan PDF");
        }
        return pdf;
      } finally {
        await browser.close().catch(() => undefined);
      }
    },
  };
}
