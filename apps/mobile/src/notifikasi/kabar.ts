import { NOTIFICATION_PARAM_SCHEMAS, type Notification } from "@nawasena/schemas";
import { createStore } from "zustand/vanilla";
import type { TujuanTautan } from "../navigation/deep-link";
import { dataPush, tujuanPush } from "../push/tujuan";
import { tujuanNotifikasi } from "./tujuan";

export interface Banner {
  jumlah: number;
  id: string | null;
  tujuan: TujuanTautan;
  item: Notification | null;
}
export interface StateKabar {
  sub: string | null;
  versi: number;
  aktif: boolean;
  siap: boolean;
  sinkron: "menunggu" | "siap" | "gagal";
  banner: Banner | null;
}
type Kabar = { tujuan: TujuanTautan; item: Notification | null };

/** Push dan poll memakai ID yang sama. Pemuatan/resume pertama selalu diam. */
export function createKabarNotifikasi() {
  const store = createStore<StateKabar>(() => ({
    sub: null,
    versi: 0,
    aktif: false,
    siap: false,
    sinkron: "menunggu",
    banner: null,
  }));
  const dikenal = new Set<string>();
  const pending = new Map<string, Kabar>();
  let baseline = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  function hentikanTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }
  function kenali(id: string) {
    if (dikenal.has(id)) return;
    if (dikenal.size >= 500) dikenal.delete(dikenal.values().next().value ?? "");
    dikenal.add(id);
  }
  function flush() {
    hentikanTimer();
    if (!pending.size) return;
    const lama = store.getState().banner;
    const jumlah = (lama?.jumlah ?? 0) + pending.size;
    const pertama = pending.entries().next().value;
    store.setState({
      banner:
        jumlah === 1 && pertama
          ? { jumlah, id: pertama[0], ...pertama[1] }
          : { jumlah, id: null, tujuan: { layar: "Notifikasi" }, item: null },
    });
    pending.clear();
  }
  function tambah(id: string, kabar: Kabar) {
    if (dikenal.has(id)) return false;
    kenali(id);
    pending.set(id, kabar);
    // Jendela tetap, bukan debounce bergeser: burst panjang tetap diumumkan.
    if (!timer) timer = setTimeout(flush, 500);
    if (pending.size >= 500) flush();
    return true;
  }
  function boleh() {
    const s = store.getState();
    return s.sub !== null && s.aktif && s.siap;
  }
  return {
    store,
    akun(sub: string | null) {
      if (sub === store.getState().sub) return;
      hentikanTimer();
      dikenal.clear();
      pending.clear();
      baseline = false;
      store.setState({
        sub,
        versi: store.getState().versi + 1,
        siap: false,
        sinkron: "menunggu",
        banner: null,
      });
    },
    aturSiap(siap: boolean) {
      if (siap === store.getState().siap) return;
      if (!siap) {
        hentikanTimer();
        pending.clear();
        baseline = false;
      }
      store.setState({ siap });
    },
    aturAktif(aktif: boolean) {
      if (aktif === store.getState().aktif) return;
      if (!aktif) {
        flush();
        baseline = false;
      }
      store.setState({ aktif });
    },
    push(data: unknown) {
      if (!boleh()) return false;
      const n = dataPush(data);
      const tujuan = tujuanPush(data);
      return n && tujuan ? tambah(n.id, { tujuan, item: null }) : false;
    },
    sinkron(items: Notification[]) {
      if (!boleh()) return;
      for (const item of items) {
        if (!NOTIFICATION_PARAM_SCHEMAS[item.type].safeParse(item.params).success) continue;
        const valid = dataPush({ ...item.params, notificationId: item.id, type: item.type });
        if (!valid) continue;
        const tujuan: TujuanTautan = tujuanNotifikasi(item) ?? { layar: "Notifikasi" };
        if (pending.has(item.id)) pending.set(item.id, { tujuan, item });
        const banner = store.getState().banner;
        if (banner?.id === item.id) {
          store.setState({ banner: { ...banner, item } });
        }
        if (!baseline || item.readAt !== null) kenali(item.id);
        else tambah(item.id, { tujuan, item });
      }
      baseline = true;
      store.setState({ sinkron: "siap" });
    },
    gagal() {
      store.setState({ sinkron: "gagal" });
    },
    tutup() {
      hentikanTimer();
      pending.clear();
      store.setState({ banner: null });
    },
  };
}
