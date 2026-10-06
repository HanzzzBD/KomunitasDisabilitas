import { useEffect, useRef } from "react";
import { useLocation, useNavigation, useNavigationType } from "react-router";

/** Query/filter updates retain input focus; POP retains a restored job card. */
export function FokusRute() {
  const { pathname, hash } = useLocation();
  const tipe = useNavigationType();
  const { state } = useNavigation();
  const sebelumnya = useRef(pathname);
  useEffect(() => {
    if (state !== "idle" || sebelumnya.current === pathname) return;
    sebelumnya.current = pathname;
    const main = document.getElementById("konten-utama");
    if (!main || hash || document.querySelector('[role="dialog"]')) return;
    const fokus = () => {
      if (
        tipe === "POP" &&
        main.contains(document.activeElement) &&
        document.activeElement !== main
      )
        return true;
      const heading = main.querySelector<HTMLElement>("h1");
      if (!heading) return false;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      return true;
    };
    if (fokus()) return;
    main.focus({ preventScroll: true });
    const observer = new MutationObserver(() => {
      if (fokus()) observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, hash, state, tipe]);
  return null;
}
