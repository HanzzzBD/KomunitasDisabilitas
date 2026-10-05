import { KotakCentang } from "@nawasena/ui-native";
import { useEffect, useState } from "react";

import { Judul, Paragraf, PesanStatus } from "../komponen/Layar";
import { analitik, analitikSiap } from "./instans";

export function PrivasiAnalitik() {
  const [mati, setMati] = useState(true);
  const [siap, setSiap] = useState(false);
  const [pesan, setPesan] = useState<string>();
  useEffect(() => {
    let terpasang = true;
    void analitikSiap.then(() => {
      if (terpasang) {
        setMati(analitik.dimatikan());
        setSiap(true);
      }
    });
    return () => {
      terpasang = false;
    };
  }, []);
  return (
    <>
      <Judul tingkat={2}>Statistik penggunaan</Judul>
      <Paragraf>
        Statistik anonim membantu kami memperbaiki aplikasi. Nama, kontak, dan data disabilitas
        tidak dikirim. Pilihan ini hanya berlaku di HP ini.
      </Paragraf>
      {siap ? (
        <KotakCentang
          label="Izinkan statistik anonim"
          dicentang={!mati}
          onUbah={(aktif) => {
            setMati(!aktif);
            void analitik.aturDimatikan(!aktif);
            setPesan(
              aktif
                ? "Statistik anonim diizinkan di HP ini."
                : "Statistik anonim dimatikan di HP ini.",
            );
          }}
        />
      ) : null}
      <PesanStatus pesan={pesan} />
    </>
  );
}
