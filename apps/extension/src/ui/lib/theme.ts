export type Theme = "light" | "dark";

const STORAGE_KEY = "openwallet.theme";

// Persisted theme, defaulting to light. UI-only, never touches the background.
export function getStoredTheme(): Theme {
  return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
}

// Toggles .dark on the root, which flips the CSS token palette.
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}
