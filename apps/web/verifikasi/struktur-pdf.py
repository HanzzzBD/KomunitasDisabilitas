"""Pohon struktur tagged PDF -> JSON (PR-068c, utang U-24 / checklist PR-063).

Pengganti pemeriksaan Adobe Reader (tidak terpasang; keputusan owner 2026-09-29):
yang dibaca pembaca layar dari tagged PDF adalah POHON STRUKTUR-nya, jadi urutan
tag, tingkat heading, tautan, dan teks alternatif bisa diperiksa langsung.

Pemakaian: python struktur-pdf.py <berkas.pdf>  (butuh `pypdf`)
"""

import json
import sys

from pypdf import PdfReader
from pypdf.generic import ArrayObject, DictionaryObject, IndirectObject


def nilai(o):
    return o.get_object() if isinstance(o, IndirectObject) else o


def main(berkas):
    reader = PdfReader(berkas)
    akar = reader.trailer["/Root"]
    katalog = nilai(akar)
    tertanda = bool(nilai(katalog.get("/MarkInfo", {})).get("/Marked", False))
    bahasa = str(katalog.get("/Lang", ""))
    judul = str(reader.metadata.get("/Title", "")) if reader.metadata else ""
    struktur = nilai(katalog.get("/StructTreeRoot")) if "/StructTreeRoot" in katalog else None
    # Urutan tag dalam pohon struktur = urutan baca bagi pembaca layar. TEKS per
    # elemen sengaja tidak dilaporkan: pypdf menyangga teks per baris sehingga
    # pemasangannya ke MCID tidak andal — teks & urutan bacanya dibuktikan lewat
    # ucapan NVDA (`pdf-nyata.verifikasi.ts`), bukan ditebak di sini.
    urutan = []

    def kunjungi(el):
        el = nilai(el)
        if not isinstance(el, DictionaryObject) or el.get("/Type") in ("/MCR", "/OBJR"):
            return
        entri = {"tag": str(el.get("/S", "")).lstrip("/")}
        if "/Alt" in el:
            entri["alt"] = str(el["/Alt"])
        urutan.append(entri)
        anak = el.get("/K")
        if anak is not None:
            daftar = nilai(anak)
            for k in daftar if isinstance(daftar, ArrayObject) else [daftar]:
                kunjungi(k)

    if struktur is not None:
        kunjungi(struktur.get("/K"))

    urutan = [u for u in urutan if u and u["tag"] not in ("Document", "", "NonStruct", "Part", "Sect", "Div")]
    heading = [u for u in urutan if u["tag"] in ("H1", "H2", "H3", "H4", "H5", "H6")]
    tautan = []
    for hal in reader.pages:
        for a in nilai(hal.get("/Annots", ArrayObject())) or []:
            a = nilai(a)
            if a.get("/Subtype") == "/Link":
                aksi = nilai(a.get("/A", {}))
                tautan.append(str(aksi.get("/URI", "")))
    json.dump(
        {
            "halaman": len(reader.pages),
            "tagged": tertanda,
            "bahasa": bahasa,
            "judulMetadata": judul,
            "punyaPohonStruktur": struktur is not None,
            "heading": heading,
            "tautan": tautan,
            "urutanBaca": urutan,
        },
        sys.stdout,
        ensure_ascii=False,
        indent=2,
    )


if __name__ == "__main__":
    main(sys.argv[1])
