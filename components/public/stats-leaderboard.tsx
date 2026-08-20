import Link from "next/link";
import type { StatCategory } from "@/lib/data/types";

export function StatsLeaderboard({ category }: { category: StatCategory }) {
  return (
    <section
      aria-labelledby={`stat-${category.key}`}
      className="card-elevated overflow-hidden rounded-xl"
    >
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h2 id={`stat-${category.key}`} className="font-display text-xl">
          {category.label}
        </h2>
        <span className="text-xs tracking-[0.12em] text-muted-foreground uppercase">
          {category.key}
        </span>
      </header>

      {category.leaders.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Sin registros todavía.
        </p>
      ) : (
        <ol className="divide-y divide-white/5">
          {category.leaders.map((player) => (
            <li key={player.playerId} className="flex items-center gap-3 px-4 py-3">
              <span
                className={`w-7 shrink-0 font-display text-lg tabular-nums ${
                  player.rank === 1 ? "text-brand-amber" : "text-muted-foreground"
                }`}
                aria-label={`Posición ${player.rank}`}
              >
                {player.rank}
              </span>
              <span
                className="h-7 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: player.team.color ?? "#666" }}
                aria-hidden
              />
              <Link
                href={`/jugador/${player.playerId}`}
                className="group flex min-w-0 flex-1 flex-col"
              >
                <span className="truncate text-sm font-medium transition-colors group-hover:text-brand-amber">
                  {player.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {player.team.name}
                </span>
              </Link>
              <span className="font-display text-2xl text-brand-amber tabular-nums">
                {player.value}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
