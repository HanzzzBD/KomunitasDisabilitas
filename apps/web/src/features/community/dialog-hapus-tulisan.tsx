import { useRef, useState } from "react";
import { deleteCommunityPost, deleteCommunityComment, type ApiClient } from "@nawasena/api-client";
import type { CommunityPost, CommunityComment } from "@nawasena/schemas";
import { Dialog, Tombol } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { useStoreSesi } from "../../shared/sesi/store.js";
import { useStatusJaringan } from "../../shared/status-jaringan.js";
import { pesanGalatCommunity } from "./pesan-galat.js";

export function DialogHapusTulisan({
  klien,
  content,
  onUbah,
  onSelesai,
  fokusSelesai,
}: {
  klien: ApiClient;
  content: CommunityPost | CommunityComment;
  onUbah(content: CommunityPost | CommunityComment): Promise<void>;
  onSelesai(): void;
  fokusSelesai(): void;
}) {
  const t = useTeks();
  const { daring } = useStatusJaringan();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [galat, setGalat] = useState("");
  const locked = useRef(false);
  const dihapus = useRef(false);
  async function hapus() {
    if (locked.current || !daring || !navigator.onLine) return;
    const sesi = useStoreSesi.getState();
    if (sesi.status !== "masuk") return;
    locked.current = true;
    setPending(true);
    setGalat("");
    try {
      const hasil = await ("communityId" in content ? deleteCommunityPost : deleteCommunityComment)(
        klien,
        content.id,
      );
      if (useStoreSesi.getState() !== sesi) return;
      dihapus.current = true;
      await onUbah(hasil);
      if (useStoreSesi.getState() !== sesi) return;
      setOpen(false);
      onSelesai();
    } catch (error) {
      if (useStoreSesi.getState() === sesi) setGalat(pesanGalatCommunity(error, t));
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return (
    <Dialog
      judul={t("community.hapus.judul")}
      deskripsi={t("community.hapus.penjelasan")}
      terbuka={open}
      onUbahTerbuka={setOpen}
      labelTutup={t("community.aksi.batal")}
      fokusSaatTutup={() => {
        if (dihapus.current) {
          fokusSelesai();
          return true;
        }
        return false;
      }}
      pemicu={
        <Tombol varian="hening" className={content.status === "removed" ? "hidden" : undefined}>
          {t("community.aksi.hapus")}
        </Tombol>
      }
    >
      {galat && (
        <p role="alert" className="mb-3 text-red-700">
          {galat}
        </p>
      )}
      {!daring && <p role="status">{t("community.diskusi.luring")}</p>}
      <Tombol aria-disabled={pending || !daring} onClick={() => void hapus()}>
        {t("community.hapus.konfirmasi")}
      </Tombol>
    </Dialog>
  );
}
