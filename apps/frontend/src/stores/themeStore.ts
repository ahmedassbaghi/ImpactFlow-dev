import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

type ThemeStore = {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: "light",
      toggle: () => {
        const next: Theme = get().theme === "light" ? "dark" : "light";
        applyTheme(next);
        set({ theme: next });
      },
      set: (t) => {
        applyTheme(t);
        set({ theme: t });
      },
    }),
    {
      name: "if_theme_v1",
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    }
  )
);

function applyTheme(t: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = t;
  }
}

// Apply on initial import (before hydrate completes) using stored value
if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem("if_theme_v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      const t = parsed?.state?.theme as Theme | undefined;
      if (t === "dark" || t === "light") applyTheme(t);
    }
  } catch {
    /* noop */
  }
}
