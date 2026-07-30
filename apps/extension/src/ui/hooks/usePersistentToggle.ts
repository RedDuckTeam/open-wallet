import { useState } from "react";

const PREFIX = "openwallet.ui.";

// A boolean backed by localStorage, so an expanded/collapsed section stays that
// way across popup re-opens and remounts. Keyed per call site.
export function usePersistentToggle(
  key: string,
  initial = false,
): [boolean, (open: boolean) => void] {
  const storageKey = `${PREFIX}${key}`;
  const [open, setOpenState] = useState<boolean>(() => {
    const stored = localStorage.getItem(storageKey);
    return stored === null ? initial : stored === "1";
  });

  const setOpen = (next: boolean): void => {
    localStorage.setItem(storageKey, next ? "1" : "0");
    setOpenState(next);
  };

  return [open, setOpen];
}
