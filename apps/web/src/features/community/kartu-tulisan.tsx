import { useId, useRef, useState } from "react";
import { Link } from "react-router";
import { updateCommunityPost, updateCommunityComment, type ApiClient } from "@nawasena/api-client";
import type { CommunityPost, CommunityComment } from "@nawasena/schemas";
import { Tombol } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { useStoreSesi } from "../../shared/sesi/store.js";
import { useStatusJaringan } from "../../shared/status-jaringan.js";
import { FormTeks } from "./form-teks.js";
import { DialogLapor } from "./dialog-lapor.js";
import { DialogHapusTulisan } from "./dialog-hapus-tulisan.js";

const waktu = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});
export function KartuTulisan({
  klien,
  content,
  userId,
  bolehEdit,
  onUbah,
  ringkas = false,
  bolehLapor = true,
  tingkatJudul = 3,
}: {
  klien: ApiClient;
  content: CommunityPost | CommunityComment;
  userId: string;
  bolehEdit: boolean;
  ringkas?: boolean;
  bolehLapor?: boolean;
  tingkatJudul?: 2 | 3;
  onUbah(content: CommunityPost | CommunityComment): Promise<void>;
}) {
  const t = useTeks();
  const JudulPenulis = tingkatJudul === 2 ? "h2" : "h3";
  const { daring } = useStatusJaringan();
  const jenis = "communityId" in content ? "post" : "comment";
  const [edit, setEdit] = useState(false);
  const [pesan, setPesan] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const article = useRef<HTMLElement>(null);
  const labelId = useId();
  const milik = content.author?.id === userId;
  const nama = content.author?.fullName || t("community.diskusi.anonim");
  const tersedia = content.status !== "removed";
  async function ubah(body: string) {
    const sesi = useStoreSesi.getState();
    const hasil = await (jenis === "post" ? updateCommunityPost : updateCommunityComment)(
      klien,
      content.id,
      { body },
    );
    if (useStoreSesi.getState() !== sesi) return;
    await onUbah(hasil);
    setEdit(false);
    setPesan(t("community.tulis.berhasilEdit"));
    editButton.current?.focus();
  }
  return (
    <article
      ref={article}
      tabIndex={-1}
      aria-labelledby={labelId}
      className="page-panel min-w-0 flex flex-col gap-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <JudulPenulis id={labelId} className="text-lg font-semibold">
          {nama}
        </JudulPenulis>
        <time className="text-sm text-gray-700" dateTime={content.createdAt}>
          {waktu.format(new Date(content.createdAt))} WIB
        </time>
      </header>
      {content.status !== "published" && (
        <p className="font-semibold">{t(`community.status.${content.status}`)}</p>
      )}
      {content.moderation && milik && (
        <div className="rounded-lg border border-gray-400 p-3">
          <p className="font-semibold">{t("community.status.alasan")}</p>
          <p className="whitespace-pre-wrap break-words">{content.moderation.reason}</p>
        </div>
      )}
      {content.status === "hidden" && milik && <p>{t("community.status.editHidden")}</p>}
      {edit && bolehEdit && tersedia ? (
        <FormTeks
          jenis={jenis}
          edit
          awal={content.body}
          onKirim={ubah}
          onBatal={() => {
            setEdit(false);
            editButton.current?.focus();
          }}
        />
      ) : (
        tersedia && <p className="whitespace-pre-wrap break-words text-base">{content.body}</p>
      )}
      {jenis === "post" && (
        <p className="text-sm text-gray-700">
          {t("community.diskusi.jumlah", { jumlah: (content as CommunityPost).commentCount })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {ringkas && (
          <Link className="mr-auto py-3 underline" to={`/community/content/post/${content.id}`}>
            {t("community.diskusi.baca", { nama })}
          </Link>
        )}
        {milik && !ringkas && (
          <>
            {bolehEdit && tersedia && (
              <Tombol
                ref={editButton}
                varian="hening"
                aria-disabled={!daring}
                onClick={() => {
                  if (daring && navigator.onLine) setEdit(true);
                }}
              >
                {t("community.aksi.edit")}
              </Tombol>
            )}
            <DialogHapusTulisan
              klien={klien}
              content={content}
              onUbah={onUbah}
              onSelesai={() => setPesan(t("community.hapus.berhasil"))}
              fokusSelesai={() => article.current?.focus()}
            />
          </>
        )}
        {content.status === "published" && bolehLapor && (
          <DialogLapor
            klien={klien}
            jenis={jenis}
            id={content.id}
            onSelesai={() => setPesan(t("community.lapor.berhasil"))}
          />
        )}
      </div>
      <p role="status">{pesan}</p>
    </article>
  );
}
