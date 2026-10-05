// Kartu lowongan mobile (PR-093; paritas `KartuLowongan` + `Kecocokan` web).
//
// SATU KESATUAN bagi TalkBack (AC PR-093): kartu adalah satu tombol berlabel
// kalimat utuh (`labelKartu`), anak-anaknya tidak dibaca terpisah. Satu
// komponen untuk feed (dengan skor + alasan) dan hasil pencarian (tanpa).
import type { JobSearchResult, MatchItem } from "@nawasena/schemas";
import { Kartu, UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import { Text, View } from "react-native";

import { labelKartu, teksLokasi, teksMode, teksSkor, teksTipe } from "./teks";

export interface KartuLowonganProps {
  job: JobSearchResult;
  cocok?: Pick<MatchItem, "score" | "explanation" | "explanationSource">;
  onBuka: () => void;
}

export function KartuLowongan({ job, cocok, onBuka }: KartuLowonganProps) {
  const { warna, skalaTeks } = useTokenA11y();
  const isi = UKURAN_HURUF.isi * skalaTeks;
  const kecil = UKURAN_HURUF.label * skalaTeks;
  const lokasi = teksLokasi(job);

  return (
    <Kartu
      testID={`kartu-lowongan-${job.id}`}
      label={labelKartu(job, cocok)}
      petunjuk="Buka detail lowongan"
      onPress={onBuka}
    >
      <Text style={{ color: warna.teks, fontSize: isi + 2, fontWeight: "700" }}>{job.title}</Text>
      <Text style={{ color: warna.teks, fontSize: isi }}>{job.companyName}</Text>
      {cocok ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: warna.teks, fontSize: isi, fontWeight: "700" }}>
            {teksSkor(cocok.score)}
          </Text>
          <Text style={{ color: warna.teks, fontSize: isi }}>
            <Text style={{ fontWeight: "600" }}>Alasannya: </Text>
            {cocok.explanation}
          </Text>
          {cocok.explanationSource === "ai" ? (
            <Text style={{ color: warna.teksLemah, fontSize: kecil }}>Alasan ini ditulis AI</Text>
          ) : null}
        </View>
      ) : null}
      <Text style={{ color: warna.teksLemah, fontSize: kecil }}>
        {[teksTipe(job.employmentType), teksMode(job.workMode), lokasi].filter(Boolean).join(" · ")}
      </Text>
    </Kartu>
  );
}
