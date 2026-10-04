// Dialog native di atas `Modal` RN.
//
// FOKUS AKSESIBILITAS (AC PR-089):
//   - MASUK: begitu Modal tampil (`onShow`), fokus TalkBack dipindah ke judul.
//     Tanpa ini TalkBack tetap di elemen di belakang tirai, dan pengguna netra
//     tidak tahu ada dialog terbuka.
//   - KELUAR: saat dialog tertutup, fokus dikembalikan ke `pemicu` (biasanya
//     tombol yang membukanya). Tanpa ini fokus jatuh ke awal layar dan
//     pengguna harus menyusuri ulang dari atas.
// Di Android, Modal adalah jendela tersendiri, jadi TalkBack terkurung di
// dalamnya selama terbuka; tombol Kembali menutup dialog (`onRequestClose`).
import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { AccessibilityInfo, Modal, Text, View, type View as ViewRN } from "react-native";

import { useTokenA11y } from "./konteks";
import { Tombol } from "./tombol";
import { UKURAN_HURUF } from "./token";

export interface DialogProps {
  terbuka: boolean;
  tutup: () => void;
  judul: string;
  deskripsi?: string;
  children?: ReactNode;
  /** Elemen yang menerima fokus kembali saat dialog tertutup. */
  pemicu?: RefObject<ViewRN | null>;
  /** Label tombol tutup; bawaan "Tutup". */
  labelTutup?: string;
  testID?: string;
}

export function Dialog(props: DialogProps) {
  const { terbuka, tutup, judul, deskripsi, children, pemicu, labelTutup = "Tutup" } = props;
  const { warna, skalaTeks, kurangiGerak } = useTokenA11y();
  const judulRef = useRef<Text>(null);
  const pernahTerbuka = useRef(false);

  const fokusKeJudul = useCallback(() => {
    if (judulRef.current) AccessibilityInfo.sendAccessibilityEvent(judulRef.current, "focus");
  }, []);

  useEffect(() => {
    if (terbuka) {
      pernahTerbuka.current = true;
      return;
    }
    // Hanya transisi terbuka → tertutup; render awal yang tertutup tidak mencuri fokus.
    if (pernahTerbuka.current && pemicu?.current) {
      AccessibilityInfo.sendAccessibilityEvent(pemicu.current, "focus");
    }
  }, [terbuka, pemicu]);

  return (
    <Modal
      visible={terbuka}
      transparent
      animationType={kurangiGerak ? "none" : "fade"}
      onRequestClose={tutup}
      onShow={fokusKeJudul}
      statusBarTranslucent
    >
      <View
        style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: warna.tirai }}
      >
        <View
          testID={props.testID}
          accessibilityViewIsModal
          style={{ gap: 12, padding: 20, borderRadius: 12, backgroundColor: warna.latar }}
        >
          <Text
            ref={judulRef}
            accessibilityRole="header"
            style={{
              color: warna.teks,
              fontSize: UKURAN_HURUF.judul * skalaTeks,
              fontWeight: "700",
            }}
          >
            {judul}
          </Text>
          {deskripsi ? (
            <Text style={{ color: warna.teks, fontSize: UKURAN_HURUF.isi * skalaTeks }}>
              {deskripsi}
            </Text>
          ) : null}
          {children}
          <Tombol label={labelTutup} varian="sekunder" onPress={tutup} />
        </View>
      </View>
    </Modal>
  );
}
