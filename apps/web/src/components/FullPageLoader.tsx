/**
 * Full-page loading spinner shown only during the initial auth check.
 * This is the only time a full-page loader is appropriate; all other
 * loading states use skeleton screens or inline spinners.
 */
export function FullPageLoader() {
  return (
    <div
      className="flex h-screen w-screen items-center justify-center bg-[var(--background)]"
      role="status"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--muted)] border-t-[var(--primary)]" />
        <p className="text-sm text-[var(--muted-foreground)]">Loading...</p>
      </div>
    </div>
  );
}
