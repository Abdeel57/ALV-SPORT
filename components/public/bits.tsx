import Link from "next/link";
import { ChipPendingOverlay } from "@/components/public/chip-status";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Título de sección estilo "lower third" de transmisión: doble barra
 * diagonal roja/ámbar + display itálico + regla de gradiente que se apaga.
 */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="flex shrink-0 gap-1">
        <span className="h-6 w-1.5 -skew-x-12 bg-brand-red" />
        <span className="h-6 w-1.5 -skew-x-12 bg-brand-amber" />
      </span>
      <h2 className="font-display text-2xl leading-none sm:text-3xl">{children}</h2>
      <div
        className="bg-brand-gradient h-px min-w-8 flex-1 self-center opacity-30"
        aria-hidden
      />
    </div>
  );
}

/** Chips de liga con corte diagonal (mismo lenguaje en home y /tabla). */
export function LeagueChips({
  leagues,
  activeSlug,
  hrefFor,
  trailing,
}: {
  leagues: Array<{ slug: string; name: string }>;
  activeSlug: string | undefined;
  hrefFor: (slug: string, index: number) => string;
  trailing?: React.ReactNode;
}) {
  return (
    <nav aria-label="Ligas" className="flex flex-wrap items-center gap-2">
      {leagues.map((league, index) => {
        const active = league.slug === activeSlug;
        return (
          <Link
            key={league.slug}
            href={hrefFor(league.slug, index)}
            aria-current={active ? "page" : undefined}
            className={`relative -skew-x-12 border px-4 py-2 text-sm transition-all duration-150 motion-safe:active:scale-[.96] ${
              active
                ? "border-brand-amber/70 bg-secondary shadow-[inset_0_-2px_0_var(--brand-amber)]"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <span
              className={`inline-block skew-x-12 ${active ? "font-display text-base leading-none" : ""}`}
            >
              {league.name}
            </span>
            <ChipPendingOverlay />
          </Link>
        );
      })}
      {trailing}
    </nav>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-dashed border-brand-silver/20 px-4 py-8 text-center text-sm text-muted-foreground">
      <span
        aria-hidden
        className="bg-brand-gradient absolute inset-x-0 top-0 h-px opacity-20"
      />
      {children}
    </div>
  );
}

export function GameCardSkeleton() {
  return (
    <div className="card-elevated flex flex-col gap-3 rounded-xl px-4 py-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-3/4" />
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card-elevated flex flex-col gap-2 rounded-xl p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

