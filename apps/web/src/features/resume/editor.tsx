import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { updateResume, type ApiClient } from "@nawasena/api-client";
import {
  resumeContentInputSchema,
  updateResumeSchema,
  type Resume,
  type ResumeContent,
} from "@nawasena/schemas";
import { AreaTeks, KolomForm, Masukan, Tombol } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { DaftarItem, type KolomItem } from "./daftar-item.js";
import { galatPerKolom, pesanGalatResume, type GalatKolom } from "./galat.js";
import {
  baca,
  buatKolomKeahlian,
  buatKolomOrganisasi,
  buatKolomPendidikan,
  buatKolomPengalaman,
  buatKolomSertifikat,
  buatKolomTautan,
  teksAtauNull,
} from "./konfigurasi-item.js";

type BagianIsi =
  | "tentang"
  | "contact"
  | "experiences"
  | "educations"
  | "skills"
  | "certifications"
  | "organizations";

interface BagianEditorProps {
  id: string;
  judul: string;
  children: ReactNode;
  onSimpan: () => void;
  sibuk: boolean;
  galat: string | null;
  tersimpan: boolean;
}

function BagianEditor({
  id,
  judul,
  children,
  onSimpan,
  sibuk,
  galat,
  tersimpan,
}: BagianEditorProps) {
  const t = useTeks();
  return (
    <details className="rounded-lg border border-gray-300 bg-white">
      <summary className="min-h-sentuh cursor-pointer px-4 py-3 text-lg font-semibold text-gray-900">
        {judul}
      </summary>
      <form
        noValidate
        aria-labelledby={id}
        className="flex flex-col gap-4 border-t border-gray-300 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!sibuk) onSimpan();
        }}
      >
        <h2 id={id} className="sr-only">
          {judul}
        </h2>
        {children}
        {galat !== null ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            {galat}
          </p>
        ) : null}
        <div>
          <Tombol type="submit" disabled={sibuk} aria-busy={sibuk}>
            {sibuk ? t("resume.aksi.menyimpan") : t("resume.aksi.simpanBagian")}
          </Tombol>
        </div>
        <p role="status" className="text-sm font-medium text-gray-700">
          {tersimpan ? t("resume.status.tersimpan", { bagian: judul }) : ""}
        </p>
      </form>
    </details>
  );
}

interface EditorResumeProps {
  resume: Resume;
  klien: ApiClient;
  onDiperbarui?: (resume: Resume) => void;
}

export function EditorResume({ resume, klien, onDiperbarui }: EditorResumeProps) {
  const t = useTeks();
  const [judul, setJudul] = useState(resume.title);
  const [tersimpan, setTersimpan] = useState(resume.content);
  const [draf, setDraf] = useState(resume.content);
  const [galat, setGalat] = useState<Readonly<Record<string, GalatKolom>>>({});
  const [galatKirim, setGalatKirim] = useState<Readonly<Record<string, string>>>({});
  const [bagianTersimpan, setBagianTersimpan] = useState<string | null>(null);
  const [pengumuman, setPengumuman] = useState("");

  const simpanJudul = useMutation({
    mutationFn: (title: string) => updateResume(klien, resume.id, { title }),
    onSuccess: (hasil) => {
      setJudul(hasil.title);
      setBagianTersimpan("title");
      setGalatKirim((lama) => ({ ...lama, title: "" }));
      onDiperbarui?.(hasil);
    },
    onError: (error) => {
      setGalatKirim((lama) => ({ ...lama, title: pesanGalatResume(error, t) }));
    },
  });

  const simpanIsi = useMutation({
    mutationFn: (arg: { bagian: BagianIsi; content: ResumeContent }) =>
      updateResume(klien, resume.id, { content: arg.content }),
    onSuccess: (hasil, arg) => {
      const content = hasil.content;
      setTersimpan(content);
      setDraf((lama) => gabungkanBagian(lama, content, arg.bagian));
      setGalat((lama) => ({ ...lama, [arg.bagian]: {} }));
      setGalatKirim((lama) => ({ ...lama, [arg.bagian]: "" }));
      setBagianTersimpan(arg.bagian);
      onDiperbarui?.(hasil);
    },
    onError: (error, arg) => {
      setGalatKirim((lama) => ({
        ...lama,
        [arg.bagian]: pesanGalatResume(error, t),
      }));
    },
  });

  function gabungkanBagian(
    lama: ResumeContent,
    baru: ResumeContent,
    bagian: BagianIsi,
  ): ResumeContent {
    if (bagian === "tentang") {
      return { ...lama, headline: baru.headline, summary: baru.summary };
    }
    return { ...lama, [bagian]: baru[bagian] };
  }

  function calonBagian(bagian: BagianIsi): ResumeContent {
    return gabungkanBagian(tersimpan, draf, bagian);
  }

  function simpanBagian(bagian: BagianIsi): void {
    setBagianTersimpan(null);
    setGalatKirim((lama) => ({ ...lama, [bagian]: "" }));
    const hasil = resumeContentInputSchema.safeParse(calonBagian(bagian));
    if (!hasil.success) {
      setGalat((lama) => ({ ...lama, [bagian]: galatPerKolom(hasil.error) }));
      return;
    }
    setGalat((lama) => ({ ...lama, [bagian]: {} }));
    simpanIsi.mutate({ bagian, content: hasil.data });
  }

  function galatBagian(bagian: BagianIsi): string | null {
    if (Object.keys(galat[bagian] ?? {}).length > 0) return t("resume.galat.periksaKolom");
    return galatKirim[bagian] || null;
  }

  function ubah<K extends keyof ResumeContent>(kunci: K, nilai: ResumeContent[K]): void {
    setDraf((lama) => ({ ...lama, [kunci]: nilai }));
    setBagianTersimpan(null);
  }

  const aksiDaftar = {
    naik: t("resume.aksi.naik"),
    turun: t("resume.aksi.turun"),
    hapus: t("resume.aksi.hapus"),
  };

  const kolomPengalaman = buatKolomPengalaman(t);
  const kolomPendidikan = buatKolomPendidikan(t);
  const kolomKeahlian = buatKolomKeahlian(t);
  const kolomSertifikat = buatKolomSertifikat(t);
  const kolomOrganisasi = buatKolomOrganisasi(t);
  const kolomTautan = buatKolomTautan(t);

  const sibuk = simpanIsi.isPending || simpanJudul.isPending;
  const umumkan = (pesan: string) => {
    setPengumuman("");
    queueMicrotask(() => {
      setPengumuman(pesan);
    });
    setBagianTersimpan(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <BagianEditor
        id="resume-bagian-judul"
        judul={t("resume.bagian.judul")}
        sibuk={sibuk}
        galat={galatKirim.title || null}
        tersimpan={bagianTersimpan === "title"}
        onSimpan={() => {
          setBagianTersimpan(null);
          const hasil = updateResumeSchema.safeParse({ title: judul });
          if (!hasil.success) {
            setGalatKirim((lama) => ({
              ...lama,
              title: hasil.error.issues[0]?.message ?? t("resume.galat.periksaKolom"),
            }));
            return;
          }
          simpanJudul.mutate(judul);
        }}
      >
        <KolomForm label={t("resume.kolom.judulCv")} wajib galat={galatKirim.title || undefined}>
          <Masukan
            value={judul}
            maxLength={120}
            onChange={(e) => {
              setJudul(e.target.value);
              setBagianTersimpan(null);
              setGalatKirim((lama) => ({ ...lama, title: "" }));
            }}
          />
        </KolomForm>
      </BagianEditor>

      <BagianEditor
        id="resume-bagian-tentang"
        judul={t("resume.bagian.tentang")}
        sibuk={sibuk}
        galat={galatBagian("tentang")}
        tersimpan={bagianTersimpan === "tentang"}
        onSimpan={() => {
          simpanBagian("tentang");
        }}
      >
        <KolomForm label={t("resume.kolom.headline")} galat={galat.tentang?.headline}>
          <Masukan
            value={baca(draf.headline)}
            maxLength={160}
            onChange={(e) => {
              ubah("headline", teksAtauNull(e.target.value));
            }}
          />
        </KolomForm>
        <KolomForm label={t("resume.kolom.ringkasan")} galat={galat.tentang?.summary}>
          <AreaTeks
            value={baca(draf.summary)}
            maxLength={2000}
            onChange={(e) => {
              ubah("summary", teksAtauNull(e.target.value));
            }}
          />
        </KolomForm>
      </BagianEditor>

      <BagianEditor
        id="resume-bagian-kontak"
        judul={t("resume.bagian.kontak")}
        sibuk={sibuk}
        galat={galatBagian("contact")}
        tersimpan={bagianTersimpan === "contact"}
        onSimpan={() => {
          simpanBagian("contact");
        }}
      >
        {(
          [
            ["email", t("resume.kolom.email"), 160],
            ["phone", t("resume.kolom.telepon"), 32],
            ["city", t("resume.kolom.kota"), 80],
            ["province", t("resume.kolom.provinsi"), 80],
          ] as const
        ).map(([nama, label, maks]) => (
          <KolomForm key={nama} label={label} galat={galat.contact?.[`contact.${nama}`]}>
            <Masukan
              value={baca(draf.contact[nama])}
              maxLength={maks}
              inputMode={nama === "phone" ? "tel" : undefined}
              onChange={(e) => {
                ubah("contact", { ...draf.contact, [nama]: teksAtauNull(e.target.value) });
              }}
            />
          </KolomForm>
        ))}
        <h3 className="text-base font-semibold text-gray-900">{t("resume.bagian.tautan")}</h3>
        <DaftarItem
          namaBagian="contact.links"
          namaSatuan={t("resume.satuan.tautan")}
          nilai={draf.contact.links}
          itemKosong={{ label: "", url: "" }}
          kolom={kolomTautan}
          galat={galat.contact ?? {}}
          onUbah={(links) => {
            ubah("contact", { ...draf.contact, links });
          }}
          onUmumkan={umumkan}
          teks={{
            ...aksiDaftar,
            kosong: t("resume.kosong.tautan"),
            tambah: t("resume.aksi.tambahTautan"),
            item: (nomor) => t("resume.item.tautan", { nomor }),
            dihapus: (nomor) => t("resume.status.dihapus", { nomor }),
            dipindah: (dari, ke) => t("resume.status.dipindah", { dari, ke }),
          }}
        />
      </BagianEditor>

      <BagianDaftar
        bagian="experiences"
        judul={t("resume.bagian.pengalaman")}
        satuan={t("resume.satuan.pengalaman")}
        kosong={t("resume.kosong.pengalaman")}
        tambah={t("resume.aksi.tambahPengalaman")}
        nilai={draf.experiences}
        itemKosong={{ title: "", company: null, startDate: null, endDate: null, description: null }}
        kolom={kolomPengalaman}
        galat={galat.experiences ?? {}}
        sibuk={sibuk}
        tersimpan={bagianTersimpan === "experiences"}
        galatBagian={galatBagian("experiences")}
        onUbah={(nilai) => {
          ubah("experiences", nilai);
        }}
        onSimpan={simpanBagian}
        onUmumkan={umumkan}
      />
      <BagianDaftar
        bagian="educations"
        judul={t("resume.bagian.pendidikan")}
        satuan={t("resume.satuan.pendidikan")}
        kosong={t("resume.kosong.pendidikan")}
        tambah={t("resume.aksi.tambahPendidikan")}
        nilai={draf.educations}
        itemKosong={{ institution: "", degree: null, field: null, year: null }}
        kolom={kolomPendidikan}
        galat={galat.educations ?? {}}
        sibuk={sibuk}
        tersimpan={bagianTersimpan === "educations"}
        galatBagian={galatBagian("educations")}
        onUbah={(nilai) => {
          ubah("educations", nilai);
        }}
        onSimpan={simpanBagian}
        onUmumkan={umumkan}
      />
      <BagianDaftar
        bagian="skills"
        judul={t("resume.bagian.keahlian")}
        satuan={t("resume.satuan.keahlian")}
        kosong={t("resume.kosong.keahlian")}
        tambah={t("resume.aksi.tambahKeahlian")}
        nilai={draf.skills}
        itemKosong={{ name: "", level: null }}
        kolom={kolomKeahlian}
        galat={galat.skills ?? {}}
        sibuk={sibuk}
        tersimpan={bagianTersimpan === "skills"}
        galatBagian={galatBagian("skills")}
        onUbah={(nilai) => {
          ubah("skills", nilai);
        }}
        onSimpan={simpanBagian}
        onUmumkan={umumkan}
      />
      <BagianDaftar
        bagian="certifications"
        judul={t("resume.bagian.sertifikasi")}
        satuan={t("resume.satuan.sertifikat")}
        kosong={t("resume.kosong.sertifikasi")}
        tambah={t("resume.aksi.tambahSertifikat")}
        nilai={draf.certifications}
        itemKosong={{ name: "", issuer: null, year: null }}
        kolom={kolomSertifikat}
        galat={galat.certifications ?? {}}
        sibuk={sibuk}
        tersimpan={bagianTersimpan === "certifications"}
        galatBagian={galatBagian("certifications")}
        onUbah={(nilai) => {
          ubah("certifications", nilai);
        }}
        onSimpan={simpanBagian}
        onUmumkan={umumkan}
      />
      <BagianDaftar
        bagian="organizations"
        judul={t("resume.bagian.organisasi")}
        satuan={t("resume.satuan.organisasi")}
        kosong={t("resume.kosong.organisasi")}
        tambah={t("resume.aksi.tambahOrganisasi")}
        nilai={draf.organizations}
        itemKosong={{ name: "", role: null, startDate: null, endDate: null, description: null }}
        kolom={kolomOrganisasi}
        galat={galat.organizations ?? {}}
        sibuk={sibuk}
        tersimpan={bagianTersimpan === "organizations"}
        galatBagian={galatBagian("organizations")}
        onUbah={(nilai) => {
          ubah("organizations", nilai);
        }}
        onSimpan={simpanBagian}
        onUmumkan={umumkan}
      />
      <p role="status" className="sr-only" aria-atomic="true">
        {pengumuman}
      </p>
    </div>
  );
}

interface BagianDaftarProps<T> {
  bagian: Exclude<BagianIsi, "tentang" | "contact">;
  judul: string;
  satuan: string;
  kosong: string;
  tambah: string;
  nilai: readonly T[];
  itemKosong: T;
  kolom: readonly KolomItem<T>[];
  galat: GalatKolom;
  sibuk: boolean;
  tersimpan: boolean;
  galatBagian: string | null;
  onUbah: (nilai: T[]) => void;
  onSimpan: (bagian: BagianIsi) => void;
  onUmumkan: (pesan: string) => void;
}

function BagianDaftar<T>(props: BagianDaftarProps<T>) {
  const t = useTeks();
  return (
    <BagianEditor
      id={`resume-bagian-${props.bagian}`}
      judul={props.judul}
      sibuk={props.sibuk}
      galat={props.galatBagian}
      tersimpan={props.tersimpan}
      onSimpan={() => {
        props.onSimpan(props.bagian);
      }}
    >
      <DaftarItem
        namaBagian={props.bagian}
        namaSatuan={props.satuan}
        nilai={props.nilai}
        itemKosong={props.itemKosong}
        kolom={props.kolom}
        galat={props.galat}
        onUbah={props.onUbah}
        onUmumkan={props.onUmumkan}
        teks={{
          kosong: props.kosong,
          tambah: props.tambah,
          naik: t("resume.aksi.naik"),
          turun: t("resume.aksi.turun"),
          hapus: t("resume.aksi.hapus"),
          item: (nomor) => t("resume.item.nomor", { nama: props.satuan, nomor }),
          dihapus: (nomor) => t("resume.status.dihapus", { nomor }),
          dipindah: (dari, ke) => t("resume.status.dipindah", { dari, ke }),
        }}
      />
    </BagianEditor>
  );
}
