import { Skeleton } from "@/components/ui/skeleton";

/** Título de sección con el divisor diagonal de marca. */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="font-display text-2xl">{children}</h2>
      <div
        className="bg-brand-gradient h-0.5 min-w-8 flex-1 rounded-full opacity-40"
        style={{ clipPath: "polygon(0 0, 100% 0, calc(100% - 6px) 100%, 6px 100%)" }}
        aria-hidden
      />
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function GameCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border px-4 py-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-3/4" />
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <Skeleton className="h-10 w-56" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <GameCardSkeleton />
        <GameCardSkeleton />
        <GameCardSkeleton />
      </div>
      <TableSkeleton />
    </main>
  );
}
