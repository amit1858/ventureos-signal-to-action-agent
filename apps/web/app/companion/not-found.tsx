import Link from "next/link";

// Shown when the Revenue Companion is disabled (the default) or a path does not
// exist. It reveals nothing about the feature being gated.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base px-5 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-xl font-semibold text-ink">This page is not available</h1>
      <p className="mt-2 max-w-[46ch] text-sm text-muted">
        The page you are looking for does not exist.
      </p>
      <Link href="/" className="btn btn-outline-primary mt-5">
        Return home
      </Link>
    </div>
  );
}
