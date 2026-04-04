/**
 * Section label with accent rule (TenacitOS SectionHeader-style).
 */
export function CtlSectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-0.5 w-6 shrink-0 rounded-full bg-foreground/80" aria-hidden />
      <span className="text-[11px] font-bold tracking-[0.2em] text-muted-foreground uppercase">{label}</span>
    </div>
  );
}
