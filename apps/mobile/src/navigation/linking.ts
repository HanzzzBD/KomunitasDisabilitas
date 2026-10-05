import type { LinkingOptions } from "@react-navigation/native";

import { deepLinkDiizinkan, PREFIKS } from "./deep-link";
import type { RootStackParamList } from "./types";

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [PREFIKS],
  // Tautan yang ditolak tidak diteruskan ke navigator sama sekali.
  filter: deepLinkDiizinkan,
  // Tanpa `initialRouteName`: sejak PR-090 Beranda hanya ada di stack "masuk",
  // dan menunjuknya dari stack "keluar" berarti menunjuk layar yang tidak ada.
  config: {
    screens: {
      // PR-092: Beranda pindah ke dalam tab `Utama`; path publiknya tetap.
      Utama: { screens: { Beranda: "beranda" } },
    },
  },
};
