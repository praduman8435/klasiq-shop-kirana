export default function OrdersLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10 sm:px-6"
      role="status"
      aria-label="Loading your orders"
    >
      <span className="sr-only">Loading your orders…</span>
      <div className="flex items-start justify-between gap-3">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-9 w-20 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border bg-card" />
        ))}
      </div>
    </div>
  );
}
