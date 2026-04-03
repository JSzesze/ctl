import Link from "next/link";

export default function NotFound() {
  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold text-heading">404</h1>
      <p className="mb-4 text-foreground">Page not found.</p>
      <p>
        <Link href="/" className="text-link underline underline-offset-[0.15em] hover:text-link-hover">
          Back to Today
        </Link>
      </p>
    </div>
  );
}
