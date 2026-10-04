import type { LinkingOptions } from "@react-navigation/native";

import { deepLinkDiizinkan, PREFIKS } from "./deep-link";
import type { RootStackParamList } from "./types";

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [PREFIKS],
  // Tautan yang ditolak tidak diteruskan ke navigator sama sekali.
  filter: deepLinkDiizinkan,
  config: {
    initialRouteName: "Beranda",
    screens: {
      Beranda: "beranda",
    },
  },
};
