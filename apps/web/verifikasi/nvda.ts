// Kendali NVDA untuk verifikasi manual-yang-diotomatiskan (PR-068c, U-24/U-28).
//
// NVDA dijalankan dengan folder konfigurasi SEMENTARA — konfigurasi milik
// pengguna (%APPDATA%\nvda) tidak disentuh sama sekali — dengan dua setelan yang
// membuat ini bisa dijalankan tanpa mengganggu siapa pun:
//   - synth `silence`: NVDA tidak bersuara, tetapi modul speech-nya tetap
//     memproses setiap ucapan seperti biasa;
//   - level log IO (12): setiap ucapan tercatat sebagai `Speaking [...]`.
// Yang dibaca verifikasi adalah log itu — apa yang BENAR-BENAR akan diucapkan
// NVDA, bukan apa yang kita kira ada di pohon aksesibilitas.
//
// HANYA WINDOWS, dan tidak dijalankan CI (tidak ada NVDA di runner Linux).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const NVDA_EXE = process.env.NVDA_EXE ?? "C:\\Program Files\\NVDA\\nvda.exe";

const INI = [
  "schemaVersion = 22",
  "[update]",
  "\tallowUsageStats = False",
  "\taskedAllowUsageStats = True",
  "\tautoCheck = False",
  "\tstartupNotification = False",
  "[general]",
  "\tshowWelcomeDialogAtStartup = False",
  "\tlanguage = en",
  "\tsaveConfigurationOnExit = False",
  "\taskToExit = False",
  "\tplayStartAndExitSounds = False",
  "\tloggingLevel = IO",
  "[speech]",
  "\tsynth = silence",
  "",
].join("\r\n");

export interface SesiNvda {
  berkasLog: string;
  hentikan(): void;
  /** Seluruh ucapan sejak NVDA dinyalakan, berurutan. */
  ucapan(): string[];
}

export async function nyalakanNvda(): Promise<SesiNvda> {
  if (!existsSync(NVDA_EXE)) throw new Error(`NVDA tidak ditemukan di ${NVDA_EXE}`);
  const folder = mkdtempSync(join(tmpdir(), "nvda-verifikasi-"));
  const konfigurasi = join(folder, "config");
  mkdirSync(konfigurasi);
  writeFileSync(join(konfigurasi, "nvda.ini"), INI, "utf8");
  const berkasLog = join(folder, "nvda.log");

  // `nvda.exe` membawa manifest uiAccess: CreateProcess biasa ditolak (EACCES /
  // ERROR_ELEVATION_REQUIRED). `start` memakai ShellExecute, yang menghormatinya.
  spawn(
    "cmd.exe",
    [
      "/c",
      "start",
      '""',
      `"${NVDA_EXE}"`,
      "-r",
      "--disable-addons",
      `"--config-path=${konfigurasi}"`,
      `"--log-file=${berkasLog}"`,
      "--log-level=12",
    ],
    { detached: true, stdio: "ignore", windowsVerbatimArguments: true },
  ).unref();

  // NVDA siap bila log-nya sudah menulis sesuatu dan tidak ada galat pemuatan.
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (existsSync(berkasLog) && readFileSync(berkasLog, "utf8").includes("NVDA initialized"))
      break;
  }

  return {
    berkasLog,
    hentikan() {
      // Kode keluar diabaikan: NVDA mungkin sudah berhenti.
      spawnSync("cmd.exe", ["/c", "start", '""', "/wait", `"${NVDA_EXE}"`, "-q"], {
        stdio: "ignore",
        windowsVerbatimArguments: true,
      });
    },
    ucapan() {
      if (!existsSync(berkasLog)) return [];
      const isi = readFileSync(berkasLog, "utf8");
      // Format log NVDA: "IO - speech.speech.speak (...):\nSpeaking [...]".
      return [...isi.matchAll(/^Speaking (\[.*\])$/gm)].map((m) => m[1] ?? "");
    },
  };
}

/**
 * Tekan tombol di tingkat OS (SendKeys Windows) — HANYA bila jendela yang sedang
 * di depan judulnya memuat `judulJendela`; selain itu MELEMPAR tanpa mengirim apa
 * pun.
 *
 * Diperlukan untuk PERINTAH NVDA (mode jelajah: panah untuk baris, `h` untuk
 * heading, `k` untuk tautan): NVDA memasang kait keyboard OS, dan event yang
 * disuntik Playwright lewat CDP tidak pernah melewatinya.
 *
 * PENJAGA JENDELA ITU WAJIB, dan lahir dari kejadian nyata (2026-09-29): run
 * pertama tanpa penjaga mengirim Ctrl+Home dan panah bawah ke File Explorer
 * pengguna yang kebetulan sedang di depan. Tombol navigasi saja, tanpa akibat —
 * tetapi harness verifikasi tidak boleh menyentuh jendela lain sama sekali.
 * Notasi SendKeys: `{DOWN}`, `^{HOME}` (Ctrl+Home), `h`.
 */
export function tekanTombolOs(tombol: string, judulJendela: string): void {
  const aman = tombol.replace(/'/g, "''");
  const judul = judulJendela.replace(/'/g, "''");
  const skrip = [
    "Add-Type -AssemblyName System.Windows.Forms",
    'Add-Type @"',
    "using System; using System.Runtime.InteropServices; using System.Text;",
    "public static class Jendela {",
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
    "}",
    '"@',
    "$sb = New-Object System.Text.StringBuilder 512",
    "[void][Jendela]::GetWindowText([Jendela]::GetForegroundWindow(), $sb, 512)",
    `if (-not $sb.ToString().Contains('${judul}')) { Write-Error ("JENDELA SALAH: " + $sb.ToString()); exit 3 }`,
    `[System.Windows.Forms.SendKeys]::SendWait('${aman}')`,
  ].join("\n");
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-Command", skrip], { stdio: "pipe" });
  } catch (err) {
    throw new Error(
      `Tombol TIDAK dikirim: jendela di depan bukan "${judulJendela}". ${String((err as { stderr?: Buffer }).stderr ?? "")}`,
    );
  }
}

/** Judul jendela yang sedang di depan (untuk memastikan NVDA membaca jendela uji). */
export function judulJendelaDepan(): string {
  const skrip = [
    'Add-Type @"',
    "using System; using System.Runtime.InteropServices; using System.Text;",
    "public static class JendelaDepan {",
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
    "}",
    '"@',
    "$sb = New-Object System.Text.StringBuilder 512",
    "[void][JendelaDepan]::GetWindowText([JendelaDepan]::GetForegroundWindow(), $sb, 512)",
    "Write-Output $sb.ToString()",
  ].join("__BARIS__");
  return execFileSync(
    "powershell.exe",
    ["-NoProfile", "-Command", skrip.split("__BARIS__").join("\n")],
    {
      encoding: "utf8",
    },
  ).trim();
}
