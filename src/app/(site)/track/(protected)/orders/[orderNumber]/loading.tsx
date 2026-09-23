export default function OrderDetailLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10 sm:px-6"
      role="status"
      aria-label="Loading order details"
    >
      <span className="sr-only">Loading order details…</span>
      <div className="h-5 w-24 animate-pulse rounded bg-muted" />
      <div className="flex items-start justify-between gap-3">
        <div className="h-7 w-36 animate-pulse rounded bg-muted" />
        <div className="h-8 w-24 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="h-24 animate-pulse rounded-xl border bg-card" />
      <div className="h-40 animate-pulse rounded-xl border bg-card" />
      <div className="h-32 animate-pulse rounded-xl border bg-card" />
    </div>
  );
}
