"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { STORAGE_THEME } from "@/config/storage-keys";
import {
  applyThemePreferenceToDocument,
  isThemePreference,
  type ThemePreference,
} from "@/lib/theme-preference";

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** False until client has read localStorage. */
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("dark");
  const [ready, setReady] = useState(false);

  /** One layout pass: read storage, apply to <html>, then expose ready (toggle must update DOM here). */
  useLayoutEffect(() => {
    let next: ThemePreference = "dark";
    try {
      const raw = localStorage.getItem(STORAGE_THEME);
      if (isThemePreference(raw)) {
        next = raw;
      }
    } catch {
      /* private mode */
    }
    setPreferenceState(next);
    applyThemePreferenceToDocument(next);
    setReady(true);
  }, []);

  useLayoutEffect(() => {
    if (!ready) {
      return;
    }
    applyThemePreferenceToDocument(preference);
    try {
      localStorage.setItem(STORAGE_THEME, preference);
    } catch {
      /* */
    }
  }, [preference, ready]);

  useLayoutEffect(() => {
    if (!ready || preference !== "system") {
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemePreferenceToDocument("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference, ready]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
  }, []);

  const value = useMemo(
    () => ({ preference, setPreference, ready }),
    [preference, setPreference, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
