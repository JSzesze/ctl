export type ThemePreference = "dark" | "light" | "system";

export function isThemePreference(v: string | null): v is ThemePreference {
  return v === "dark" || v === "light" || v === "system";
}

export function resolveEffectiveTheme(pref: ThemePreference): "dark" | "light" {
  if (pref === "dark") {
    return "dark";
  }
  if (pref === "light") {
    return "light";
  }
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyThemePreferenceToDocument(pref: ThemePreference): void {
  const dark = resolveEffectiveTheme(pref) === "dark";
  const html = document.documentElement;
  html.classList.remove("light", "dark");
  html.classList.add(dark ? "dark" : "light");
  html.dataset.themePref = pref;
  html.dataset.colorScheme = dark ? "dark" : "light";
}
