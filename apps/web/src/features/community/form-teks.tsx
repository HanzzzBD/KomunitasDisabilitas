import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  createCommunityPostSchema,
  createCommunityCommentSchema,
  COMMUNITY_CONTENT_LIMITS,
} from "@nawasena/schemas";
import { Tombol } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { useStoreSesi } from "../../shared/sesi/store.js";
import { useStatusJaringan } from "../../shared/status-jaringan.js";
import { pesanGalatCommunity } from "./pesan-galat.js";
import { bacaDrafCommunity, simpanDrafCommunity } from "./draf.js";

export function FormTeks({
  jenis,
  drafKey,
  awal = "",
  edit = false,
  onKirim,
  onBatal,
}: {
  jenis: "post" | "comment";
  drafKey?: string;
  awal?: string;
  edit?: boolean;
  onKirim(body: string): Promise<void>;
  onBatal?: () => void;
}) {
  const t = useTeks();
  const id = useId();
  const max =
    jenis === "post"
      ? COMMUNITY_CONTENT_LIMITS.postMaxLength
      : COMMUNITY_CONTENT_LIMITS.commentMaxLength;
  const [body, setBody] = useState(() => (drafKey ? bacaDrafCommunity(drafKey, max) : awal));
  const [tersimpan, setTersimpan] = useState(true);
  const [galat, setGalat] = useState("");
  const [tidakValid, setTidakValid] = useState(false);
  const [pesan, setPesan] = useState("");
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const { daring } = useStatusJaringan();
  useEffect(() => {
    if (edit) field.current?.focus();
  }, [edit]);
  function ubah(value: string) {
    setBody(value);
    setGalat("");
    setTidakValid(false);
    setPesan("");
    if (drafKey && useStoreSesi.getState().status === "masuk")
      setTersimpan(simpanDrafCommunity(drafKey, value));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (locked.current || !daring || !navigator.onLine) return;
    const sesi = useStoreSesi.getState();
    if (sesi.status !== "masuk") return;
    const parsed = (
      jenis === "post" ? createCommunityPostSchema : createCommunityCommentSchema
    ).safeParse({ body });
    if (!parsed.success) {
      setTidakValid(true);
      setGalat(t(body.trim() ? "community.tulis.tidakValid" : "community.tulis.kosong", { max }));
      field.current?.focus();
      return;
    }
    locked.current = true;
    setPending(true);
    setGalat("");
    setTidakValid(false);
    setPesan("");
    try {
      await onKirim(parsed.data.body);
      if (useStoreSesi.getState() !== sesi) return;
      if (drafKey) simpanDrafCommunity(drafKey, "");
      if (!edit) setBody("");
      setPesan(
        t(
          edit
            ? "community.tulis.berhasilEdit"
            : jenis === "post"
              ? "community.tulis.berhasil"
              : "community.tulis.berhasilKomentar",
        ),
      );
    } catch (error) {
      if (useStoreSesi.getState() === sesi) setGalat(pesanGalatCommunity(error, t));
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate>
      <label className="text-base font-semibold" htmlFor={id}>
        {t(edit ? "community.tulis.edit" : `community.tulis.${jenis}`)}
      </label>
      <p id={`${id}-hint`} className="text-base text-gray-700">
        {t("community.tulis.petunjuk", { max })}
      </p>
      <textarea
        ref={field}
        id={id}
        rows={4}
        value={body}
        readOnly={pending}
        maxLength={max}
        className="min-h-32 w-full resize-y rounded-lg border border-gray-500 bg-white p-3 text-base"
        aria-invalid={tidakValid}
        aria-describedby={`${id}-hint ${id}-count${galat ? ` ${id}-error` : ""}`}
        onChange={(e) => ubah(e.target.value)}
      />
      <p id={`${id}-count`} className="text-sm text-gray-700">
        {t("community.tulis.hitung", { jumlah: body.length, max })}
      </p>
      {drafKey && (
        <p className="text-sm text-gray-700" role={tersimpan ? undefined : "status"}>
          {t(tersimpan ? "community.tulis.draf" : "community.tulis.drafGagal")}
        </p>
      )}
      {!daring && <p role="status">{t("community.diskusi.luring")}</p>}
      {galat && (
        <p id={`${id}-error`} role="alert" className="text-base text-red-700">
          {galat}
        </p>
      )}
      <p role="status" className="text-base">
        {pending ? t("community.tulis.mengirim") : pesan}
      </p>
      <div className="flex flex-wrap gap-2">
        <Tombol type="submit" aria-disabled={pending || !daring}>
          {t(
            edit
              ? "community.tulis.simpan"
              : jenis === "post"
                ? "community.tulis.kirim"
                : "community.tulis.komentar",
          )}
        </Tombol>
        {onBatal && (
          <Tombol
            varian="sekunder"
            aria-disabled={pending}
            onClick={() => {
              if (!pending) onBatal();
            }}
          >
            {t("community.aksi.batal")}
          </Tombol>
        )}
        {drafKey && (
          <Tombol
            varian="hening"
            aria-disabled={pending || !body}
            onClick={() => {
              if (!pending) {
                ubah("");
                field.current?.focus();
              }
            }}
          >
            {t("community.tulis.buang")}
          </Tombol>
        )}
      </div>
    </form>
  );
}
