import { useState } from "react";
import { getStoredTheme, setTheme, type Theme } from "../lib/theme.js";

export interface UseTheme {
  readonly theme: Theme;
  readonly setTheme: (theme: Theme) => void;
}

export function useTheme(): UseTheme {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  return {
    theme,
    setTheme: (next: Theme) => {
      setTheme(next);
      setThemeState(next);
    },
  };
}
