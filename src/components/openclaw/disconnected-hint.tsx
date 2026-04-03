import Link from "next/link";

export function OpenClawDisconnectedHint() {
  return (
    <p className="rounded-lg border border-dashed border-border-muted bg-surface-status/40 px-4 py-6 text-center text-sm text-muted">
      Connect to the gateway in{" "}
      <Link href="/config" className="text-link underline underline-offset-[0.15em] hover:text-link-hover">
        Config
      </Link>{" "}
      first.
    </p>
  );
}
