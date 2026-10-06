import { useRef, useState } from "react";
import {
  createCommunityAdmin,
  updateCommunityAdmin,
  archiveCommunityAdmin,
  type ApiClient,
} from "@nawasena/api-client";
import { createCommunitySchema, type Community, type CreateCommunity } from "@nawasena/schemas";
import { AreaTeks, Dialog, KolomForm, Masukan, Tombol } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { useStatusJaringan } from "../../shared/status-jaringan.js";
import { useStoreSesi } from "../../shared/sesi/store.js";
import { galatAdminCommunity } from "./community-shared.js";
export function FormulirCommunity({
  klien,
  room,
  onSelesai,
}: {
  klien: ApiClient;
  room?: Community;
  onSelesai: (room: Community) => void;
}) {
  const t = useTeks();
  const { daring } = useStatusJaringan();
  const [value, setValue] = useState<CreateCommunity>(() =>
    room
      ? {
          name: room.name,
          slug: room.slug,
          description: room.description,
          type: room.type,
          city: room.city,
        }
      : { name: "", slug: "", description: "", type: "topic", city: null },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const lock = useRef(false);
  async function run(status = false) {
    if (lock.current || !daring || !navigator.onLine) return;
    const parsed = createCommunitySchema.safeParse(value);
    if (!status && !parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      );
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(),
      );
      return;
    }
    const session = useStoreSesi.getState();
    if (session.status !== "masuk") return;
    lock.current = true;
    setPending(true);
    setErrors({});
    setError(null);
    try {
      const result =
        status && room
          ? room.status === "active"
            ? await archiveCommunityAdmin(klien, room.id)
            : await updateCommunityAdmin(klien, room.id, { status: "active" })
          : room
            ? await updateCommunityAdmin(klien, room.id, parsed.success ? parsed.data : value)
            : await createCommunityAdmin(klien, parsed.success ? parsed.data : value);
      if (useStoreSesi.getState() === session) {
        setConfirm(false);
        onSelesai(result);
      }
    } catch (e) {
      if (useStoreSesi.getState() === session) setError(e);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <form
        ref={form}
        noValidate
        className="page-panel flex flex-col gap-4"
        aria-label={t(room ? "admin.community.edit" : "admin.community.baru")}
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <KolomForm label={t("admin.community.nama")} wajib galat={errors.name}>
          <Masukan
            value={value.name}
            maxLength={120}
            readOnly={pending}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </KolomForm>
        <KolomForm
          label={t("admin.community.slug")}
          bantuan={t("admin.community.slugHelp")}
          wajib
          galat={errors.slug}
        >
          <Masukan
            value={value.slug}
            maxLength={100}
            readOnly={pending}
            onChange={(e) => setValue({ ...value, slug: e.target.value })}
          />
        </KolomForm>
        <KolomForm label={t("admin.community.deskripsi")} wajib galat={errors.description}>
          <AreaTeks
            value={value.description}
            maxLength={2000}
            rows={5}
            readOnly={pending}
            onChange={(e) => setValue({ ...value, description: e.target.value })}
          />
        </KolomForm>
        <label className="flex flex-col gap-2 font-semibold">
          {t("admin.community.jenis")}
          <select
            className="min-h-sentuh rounded-md border border-gray-500 bg-white p-2 text-base"
            value={value.type}
            disabled={pending}
            onChange={(e) =>
              setValue({
                ...value,
                type: e.target.value as "topic" | "city",
                city: e.target.value === "topic" ? null : "",
              })
            }
          >
            <option value="topic">{t("admin.community.topic")}</option>
            <option value="city">{t("admin.community.city")}</option>
          </select>
        </label>
        {value.type === "city" ? (
          <KolomForm label={t("admin.community.city")} wajib galat={errors.city}>
            <Masukan
              value={value.city ?? ""}
              maxLength={120}
              readOnly={pending}
              onChange={(e) => setValue({ ...value, city: e.target.value })}
            />
          </KolomForm>
        ) : null}
        {Object.keys(errors).length ? <p role="alert">{t("admin.community.periksa")}</p> : null}
        {error && !confirm ? (
          <p role="alert" className="text-red-700">
            {galatAdminCommunity(error, t)}
          </p>
        ) : null}
        <Tombol
          className="self-start"
          type="submit"
          aria-disabled={!daring || pending}
          aria-busy={pending}
        >
          {t(pending ? "admin.community.menyimpan" : "admin.community.simpan")}
        </Tombol>
      </form>
      {room ? (
        <div className="flex flex-col items-start gap-3">
          <p>{t(`admin.community.${room.status}`)}</p>
          <Dialog
            judul={t(
              room.status === "active" ? "admin.community.arsip" : "admin.community.aktifkan",
            )}
            deskripsi={t(
              room.status === "active"
                ? "admin.community.arsipAkibat"
                : "admin.community.aktifkanAkibat",
            )}
            terbuka={confirm}
            onUbahTerbuka={(v) => {
              if (!lock.current) {
                setConfirm(v);
                setError(null);
              }
            }}
            labelTutup={t("admin.community.tutup")}
            pemicu={
              <Tombol varian="sekunder" aria-disabled={!daring || pending}>
                {t(room.status === "active" ? "admin.community.arsip" : "admin.community.aktifkan")}
              </Tombol>
            }
          >
            <div className="flex flex-col gap-4">
              {error ? <p role="alert">{galatAdminCommunity(error, t)}</p> : null}
              <div className="flex flex-wrap gap-3">
                <Tombol
                  aria-disabled={!daring || pending}
                  aria-busy={pending}
                  onClick={() => void run(true)}
                >
                  {t(pending ? "admin.community.menyimpan" : "admin.community.konfirmasi")}
                </Tombol>
                <Tombol
                  varian="sekunder"
                  aria-disabled={pending}
                  onClick={() => {
                    if (!lock.current) setConfirm(false);
                  }}
                >
                  {t("admin.community.batal")}
                </Tombol>
              </div>
            </div>
          </Dialog>
        </div>
      ) : null}
    </div>
  );
}
