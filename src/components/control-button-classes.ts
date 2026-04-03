/**
 * Control UI buttons. Tailwind preflight sets `appearance: button`, which
 * paints native system styling (often bright blue on macOS). `appearance-none`
 * keeps fills and borders fully under our tokens.
 */
const btnBase =
  "inline-flex appearance-none items-center justify-center rounded-md border px-[0.85rem] py-[0.45rem] text-sm disabled:cursor-not-allowed disabled:opacity-50";

export const btnClass = `${btnBase} border-border-button bg-surface-button text-foreground hover:bg-surface-button-hover`;

/** Single background source — avoids losing to `bg-surface-button` when utilities reorder in the bundle. */
export const primaryBtnClass = `${btnBase} border-border-primary bg-[var(--bg-primary)] text-[var(--text-primary-button)] hover:bg-[var(--bg-primary-hover)]`;
