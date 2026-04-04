/** Dispatched on `window` so any client control can open the palette without prop drilling. */
export const CTL_OPEN_COMMAND_PALETTE_EVENT = "ctl-open-command-palette";

export function openCtlCommandPalette(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(CTL_OPEN_COMMAND_PALETTE_EVENT));
}
