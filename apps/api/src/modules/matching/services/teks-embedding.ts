// modules/matching — penyusun teks embedding (PR-069).
//
// SATU-SATUNYA TEMPAT yang memutuskan apa yang dikirim ke model embedding.
// Karena itu ia fungsi murni tanpa dependensi: pertanyaan "apakah data
// disabilitas bisa ikut terkirim?" dijawab dengan membaca berkas ini dan test-nya,
// bukan dengan menelusuri alur.
//
// DUA LAPIS JAMINAN BEBAS DATA SENSITIF (Security Considerations PR-069):
//   1. Tipe masukannya tidak punya tempat bagi `disabilityTypes` maupun
//      `accommodationNeeds` — sumbernya `findSafeByUserId`, yang kolom
//      sensitifnya bahkan tidak pernah meninggalkan PostgreSQL (PR-039).
//   2. Penyusun hanya membaca field yang DISEBUT NAMANYA di bawah. Objek yang
//      kebetulan membawa properti lebih (TypeScript struktural mengizinkannya)
//      tetap tidak bisa menyelundupkannya ke teks — dibuktikan test.
//
// YANG SENGAJA TIDAK IKUT, meski bukan data sensitif: lokasi, mode kerja,
// kesediaan kerja jarak jauh, jenis kontrak, dan akomodasi lowongan. Semuanya
// dinilai sebagai data TERSTRUKTUR (filter PR-070, komponen skor PR-071).
// Menanamnya juga ke vektor berarti menghitungnya dua kali — dan membuat dua
// orang berkeahlian sama tampak berjauhan hanya karena kotanya berbeda.

/** Bagian profil yang bermakna semantik. */
export interface ProfilUntukEmbedding {
  profil: { headline: string | null; summary: string | null };
  keahlian: ReadonlyArray<{ name: string; level: string | null }>;
  pengalaman: ReadonlyArray<{ title: string; company: string | null; description: string | null }>;
  pendidikan: ReadonlyArray<{ institution: string; degree: string | null; field: string | null }>;
}

/** Bagian lowongan yang bermakna semantik. */
export interface LowonganUntukEmbedding {
  title: string;
  description: string;
  requirements: string | null;
}

/**
 * Batas panjang teks (karakter). `gemini-embedding-001` menerima ±2.048 token;
 * 8.000 karakter Bahasa Indonesia berada di bawahnya dengan jarak aman.
 * Memotong DI SINI (bukan membiarkan provider menolak) berarti profil yang
 * sangat panjang tetap punya vektor — dari bagian yang paling bermakna, sebab
 * urutan baris di bawah disusun dari sinyal terkuat.
 */
export const BATAS_TEKS_EMBEDDING = 8_000;

function bersih(teks: string | null | undefined): string {
  return (teks ?? "").replace(/\s+/g, " ").trim();
}

function baris(label: string, isi: string): string | null {
  return isi === "" ? null : `${label}: ${isi}`;
}

function rakit(daftar: Array<string | null>): string {
  const teks = daftar.filter((b): b is string => b !== null).join("\n");
  return teks.length <= BATAS_TEKS_EMBEDDING ? teks : teks.slice(0, BATAS_TEKS_EMBEDDING).trimEnd();
}

/** Teks profil. String kosong = tidak ada apa pun yang bisa di-embed. */
export function teksProfil(bahan: ProfilUntukEmbedding): string {
  const keahlian = bahan.keahlian
    .map((k) => {
      const nama = bersih(k.name);
      const level = bersih(k.level);
      return level === "" ? nama : `${nama} (${level})`;
    })
    .filter((k) => k !== "")
    .join(", ");

  const pengalaman = bahan.pengalaman.map((p) => {
    const posisi = [bersih(p.title), bersih(p.company)].filter((x) => x !== "").join(" di ");
    return baris("Pengalaman", [posisi, bersih(p.description)].filter((x) => x !== "").join(". "));
  });

  const pendidikan = bahan.pendidikan.map((p) =>
    baris(
      "Pendidikan",
      [bersih(p.degree), bersih(p.field), bersih(p.institution)].filter((x) => x !== "").join(", "),
    ),
  );

  return rakit([
    baris("Judul profil", bersih(bahan.profil.headline)),
    baris("Keahlian", keahlian),
    baris("Ringkasan", bersih(bahan.profil.summary)),
    ...pengalaman,
    ...pendidikan,
  ]);
}

/** Teks lowongan. */
export function teksLowongan(bahan: LowonganUntukEmbedding): string {
  return rakit([
    baris("Posisi", bersih(bahan.title)),
    baris("Persyaratan", bersih(bahan.requirements)),
    baris("Deskripsi", bersih(bahan.description)),
  ]);
}
