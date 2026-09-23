export default function InvoiceLoading() {
  return (
    <div className="store-theme min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-2xl p-4 sm:p-8" role="status" aria-label="Loading invoice">
        <span className="sr-only">Loading invoice…</span>
        <div className="flex items-start justify-between gap-4">
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        </div>
        <div className="mt-8 h-24 animate-pulse rounded-lg bg-muted" />
        <div className="mt-6 h-48 animate-pulse rounded-lg bg-muted" />
        <div className="mt-6 h-32 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}
