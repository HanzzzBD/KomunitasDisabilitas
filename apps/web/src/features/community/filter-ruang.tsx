import { useEffect, useState } from "react";
import { KolomForm, Masukan, Pilihan, Tombol } from "@nawasena/ui";
import type { CommunityType } from "@nawasena/schemas";
import { useTeks } from "../../shared/i18n/index.js";
import type { FilterCommunity } from "./filter-url.js";

export function FilterRuang({
  filter,
  onTerapkan,
}: {
  filter: FilterCommunity;
  onTerapkan: (filter: FilterCommunity) => void;
}) {
  const t = useTeks();
  const [jenis, setJenis] = useState<CommunityType | "semua">(filter.type ?? "semua");
  const [kota, setKota] = useState(filter.city ?? "");
  useEffect(() => {
    setJenis(filter.type ?? "semua");
    setKota(filter.city ?? "");
  }, [filter.type, filter.city]);

  return (
    <form
      className="page-panel flex flex-col gap-4"
      aria-label={t("community.filter.label")}
      onSubmit={(e) => {
        e.preventDefault();
        onTerapkan({
          ...(jenis === "semua" ? {} : { type: jenis }),
          ...(kota.trim() ? { city: kota.trim() } : {}),
        });
      }}
    >
      <h2 className="text-lg font-semibold">{t("community.filter.label")}</h2>
      <KolomForm label={t("community.filter.jenis")}>
        <Pilihan
          nilai={jenis}
          onUbah={(nilai) => setJenis(nilai as typeof jenis)}
          opsi={[
            { nilai: "semua", label: t("community.filter.semua") },
            { nilai: "topic", label: t("community.jenis.topic") },
            { nilai: "city", label: t("community.jenis.city") },
          ]}
        />
      </KolomForm>
      <KolomForm label={t("community.filter.kota")} bantuan={t("community.filter.kotaPetunjuk")}>
        <Masukan value={kota} maxLength={120} onChange={(e) => setKota(e.target.value)} />
      </KolomForm>
      <Tombol type="submit">{t("community.filter.terapkan")}</Tombol>
      <Tombol
        varian="hening"
        onClick={() => {
          setJenis("semua");
          setKota("");
          onTerapkan({});
        }}
      >
        {t("community.filter.reset")}
      </Tombol>
    </form>
  );
}
