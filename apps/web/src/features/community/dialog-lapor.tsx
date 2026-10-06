import { useId, useRef, useState, type FormEvent } from "react";
import { communityReasonInputSchema, type CommunityReportTargetType } from "@nawasena/schemas";
import { reportCommunityContent, type ApiClient } from "@nawasena/api-client";
import { Dialog, Tombol } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { useStoreSesi } from "../../shared/sesi/store.js";
import { useStatusJaringan } from "../../shared/status-jaringan.js";
import { pesanGalatCommunity } from "./pesan-galat.js";

export function DialogLapor({
  klien,
  jenis,
  id,
  onSelesai,
}: {
  klien: ApiClient;
  jenis: CommunityReportTargetType;
  id: string;
  onSelesai: () => void;
}) {
  const t = useTeks();
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      judul={t("community.lapor.judul")}
      deskripsi={t("community.lapor.penjelasan")}
      labelTutup={t("community.aksi.batal")}
      terbuka={open}
      onUbahTerbuka={setOpen}
      pemicu={<Tombol varian="hening">{t("community.lapor.judul")}</Tombol>}
    >
      <IsiLaporan
        klien={klien}
        jenis={jenis}
        id={id}
        onSelesai={() => {
          onSelesai();
          setOpen(false);
        }}
      />
    </Dialog>
  );
}
function IsiLaporan({
  klien,
  jenis,
  id,
  onSelesai,
}: {
  klien: ApiClient;
  jenis: CommunityReportTargetType;
  id: string;
  onSelesai: () => void;
}) {
  const t = useTeks();
  const fieldId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const locked = useRef(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [tidakValid, setTidakValid] = useState(false);
  const [pending, setPending] = useState(false);
  const { daring } = useStatusJaringan();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (locked.current || !daring || !navigator.onLine) return;
    const sesi = useStoreSesi.getState();
    if (sesi.status !== "masuk") return;
    const parsed = communityReasonInputSchema.safeParse({ reason });
    if (!parsed.success) {
      setTidakValid(true);
      setError(t("community.lapor.validasi"));
      field.current?.focus();
      return;
    }
    locked.current = true;
    setPending(true);
    setError("");
    setTidakValid(false);
    try {
      await reportCommunityContent(klien, jenis, id, parsed.data);
      if (useStoreSesi.getState() === sesi) onSelesai();
    } catch (e) {
      if (useStoreSesi.getState() === sesi) setError(pesanGalatCommunity(e, t));
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)} noValidate>
      <label htmlFor={fieldId} className="font-semibold">
        {t("community.lapor.alasan")}
      </label>
      <p id={`${fieldId}-hint`}>{t("community.lapor.petunjuk")}</p>
      <textarea
        ref={field}
        id={fieldId}
        rows={5}
        maxLength={2000}
        value={reason}
        readOnly={pending}
        className="w-full resize-y rounded-lg border border-gray-500 bg-white p-3 text-base"
        aria-invalid={tidakValid}
        aria-describedby={`${fieldId}-hint${error ? ` ${fieldId}-error` : ""}`}
        onChange={(e) => {
          setReason(e.target.value);
          setError("");
          setTidakValid(false);
        }}
      />
      {error && (
        <p role="alert" id={`${fieldId}-error`} className="text-red-700">
          {error}
        </p>
      )}
      {!daring && <p role="status">{t("community.diskusi.luring")}</p>}
      <p role="status">{pending ? t("community.tulis.mengirim") : ""}</p>
      <Tombol type="submit" aria-disabled={pending || !daring}>
        {t("community.lapor.kirim")}
      </Tombol>
    </form>
  );
}
