import { STORAGE_THEME } from "@/config/storage-keys";

/**
 * Runs synchronously in <head> before body paint.
 * Default when unset: dark (neutral UI). Keep in sync with {@link applyThemePreferenceToDocument}.
 */
export function getThemeInitScript(): string {
  const k = JSON.stringify(STORAGE_THEME);
  return `(function(){try{var h=document.documentElement;var s=localStorage.getItem(${k});var p="dark";if(s==="dark"||s==="light"||s==="system")p=s;var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);h.classList.remove("light","dark");h.classList.add(d?"dark":"light");h.dataset.colorScheme=d?"dark":"light";}catch(e){}})();`;
}
