export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[820px] px-5 py-8" aria-busy="true" aria-live="polite">
      <div className="h-6 w-56 rounded bg-surface2" />
      <div className="mt-4 h-24 rounded-xl border border-edge bg-surface2/60" />
      <div className="mt-4 space-y-3">
        <div className="h-20 rounded-xl border border-edge bg-surface2/40" />
        <div className="h-20 rounded-xl border border-edge bg-surface2/40" />
      </div>
      <span className="sr-only">Loading demo</span>
    </div>
  );
}
