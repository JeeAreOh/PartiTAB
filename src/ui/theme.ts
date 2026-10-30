import { useCallback, useState } from "react";

/** Tema da interface. O padrão é o escuro. */
export type Theme = "dark" | "light" | "system";

const KEY = "partitab.theme";
export const THEMES: [Theme, string][] = [
  ["dark", "Escuro"],
  ["light", "Claro"],
  ["system", "Do sistema"],
];

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** O tema que está valendo agora (resolve "do sistema"). */
export function effectiveTheme(theme: Theme): "dark" | "light" {
  if (theme !== "system") return theme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* só perde a preferência */
    }
  }, []);
  /** Alterna entre escuro e claro (botão da barra superior). */
  const toggle = useCallback(
    () => setTheme(effectiveTheme(theme) === "dark" ? "light" : "dark"),
    [theme, setTheme],
  );
  return { theme, setTheme, toggle, effective: effectiveTheme(theme) };
}

export type ThemeControl = ReturnType<typeof useTheme>;
