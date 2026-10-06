import { useEffect, useRef, useState, type ReactNode } from "react";
import { communityReasonInputSchema } from "@nawasena/schemas";
import { AreaTeks, Dialog, KolomForm, Tombol } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { useStatusJaringan } from "../../shared/status-jaringan.js";
import { useStoreSesi } from "../../shared/sesi/store.js";
import { galatAdminCommunity } from "./community-shared.js";
export type AksiCommunity = "hide" | "restore" | "remove" | "reject";
export function KeputusanCommunity({
  aksi,
  pemicu,
  onKirim,
  onSelesai,
  fokusSelesai,
}: {
  aksi: AksiCommunity;
  pemicu: ReactNode;
  onKirim: (reason: string) => Promise<unknown>;
  onSelesai: () => void;
  fokusSelesai?: () => boolean;
}) {
  const t = useTeks();
  const { daring } = useStatusJaringan();
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const done = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open && review) heading.current?.focus();
  }, [review, open]);
  function change(value: boolean) {
    if (lock.current) return;
    setOpen(value);
    if (value) done.current = false;
    if (!value) {
      setReason("");
      setReview(false);
      setInvalid(false);
      setError(null);
    }
  }
  async function send() {
    if (lock.current || !daring || !navigator.onLine) return;
    const parsed = communityReasonInputSchema.safeParse({ reason });
    if (!parsed.success) {
      setInvalid(true);
      setReview(false);
      return;
    }
    const session = useStoreSesi.getState();
    if (session.status !== "masuk") return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      await onKirim(parsed.data.reason);
      if (useStoreSesi.getState() !== session) return;
      done.current = true;
      setOpen(false);
      setReason("");
      setReview(false);
      onSelesai();
    } catch (e) {
      if (useStoreSesi.getState() === session) setError(e);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <Dialog
      judul={t(`admin.community.${aksi}`)}
      deskripsi={t(`admin.community.${aksi}Akibat`)}
      terbuka={open}
      onUbahTerbuka={change}
      pemicu={pemicu}
      labelTutup={t("admin.community.tutup")}
      fokusSaatTutup={() => done.current && !!fokusSelesai?.()}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (review) {
            void send();
            return;
          }
          if (!communityReasonInputSchema.safeParse({ reason }).success) {
            setInvalid(true);
            input.current?.focus();
            return;
          }
          setInvalid(false);
          setReview(true);
        }}
      >
        {review ? (
          <>
            <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold">
              {t("admin.community.konfirmasi")}
            </h3>
            <p className="font-semibold">{t("admin.community.alasan")}</p>
            <p className="break-words whitespace-pre-wrap">
              {communityReasonInputSchema.parse({ reason }).reason}
            </p>
          </>
        ) : (
          <KolomForm
            label={t("admin.community.alasan")}
            bantuan={t("admin.community.alasanHelp")}
            wajib
            galat={invalid ? t("admin.community.alasanWajib") : undefined}
          >
            <AreaTeks
              ref={input}
              rows={4}
              value={reason}
              maxLength={2000}
              onChange={(e) => setReason(e.target.value)}
            />
          </KolomForm>
        )}
        {error ? (
          <p role="alert" className="text-red-700">
            {galatAdminCommunity(error, t)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Tombol
            type="submit"
            varian={review && aksi === "remove" ? "bahaya" : "utama"}
            aria-disabled={!daring || pending}
            aria-busy={pending}
          >
            {t(
              pending
                ? "admin.community.menyimpan"
                : review
                  ? "admin.community.konfirmasi"
                  : "admin.community.lanjut",
            )}
          </Tombol>
          {review ? (
            <Tombol
              varian="sekunder"
              aria-disabled={pending}
              onClick={() => {
                if (!lock.current) {
                  setReview(false);
                  requestAnimationFrame(() => input.current?.focus());
                }
              }}
            >
              {t("admin.community.kembaliAlasan")}
            </Tombol>
          ) : null}
          <Tombol varian="sekunder" aria-disabled={pending} onClick={() => change(false)}>
            {t("admin.community.batal")}
          </Tombol>
        </div>
      </form>
    </Dialog>
  );
}
