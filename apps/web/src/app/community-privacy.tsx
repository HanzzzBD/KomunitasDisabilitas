import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { communityContentKeys, usersKeys } from "@nawasena/api-client";
import { useStoreSesi } from "../shared/sesi/store.js";
import { hapusDrafCommunity } from "../features/community/draf.js";

/** Listen synchronously: a late write response cannot reinsert private data after logout. */
export function PrivasiCommunity() {
  const cache = useQueryClient();
  useEffect(
    () =>
      useStoreSesi.subscribe((next, prev) => {
        if (next === prev) return;
        void cache.cancelQueries({ queryKey: communityContentKeys.all() });
        cache.removeQueries({ queryKey: communityContentKeys.all() });
        void cache.cancelQueries({ queryKey: ["community-membership"] });
        cache.removeQueries({ queryKey: ["community-membership"] });
        if (next.status === "masuk") void cache.resetQueries({ queryKey: usersKeys.me() });
        if (next.status === "keluar") {
          // A failed/offline boot is not a deliberate logout: preserve reload drafts.
          if (prev.status === "masuk") hapusDrafCommunity();
          void cache.cancelQueries({ queryKey: usersKeys.me() });
          cache.removeQueries({ queryKey: usersKeys.me() });
        }
      }),
    [cache],
  );
  return null;
}
