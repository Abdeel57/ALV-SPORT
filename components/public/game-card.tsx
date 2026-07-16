import Link from "next/link";
import type { GameSummary } from "@/lib/data/types";

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "America/Mexico_City",
});
const timeFormat = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

function TeamLine({
  name,
  color,
  score,
  winner,
}: {
  name: string;
  color: string | null;
  score: number | null;
  winner: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color ?? "#666" }}
          aria-hidden
        />
        <span className={`truncate text-sm ${winner ? "font-semibold" : ""}`}>
          {name}
        </span>
      </span>
      {score !== null && (
        <span
          className={`font-display text-xl tabular-nums ${
            winner ? "" : "text-muted-foreground"
          }`}
        >
          {score}
        </span>
      )}
    </div>
  );
}

export function GameCard({ game }: { game: GameSummary }) {
  const isLive = game.status === "in_progress";
  const isFinal = game.status === "finalized";
  const homeWins = isFinal && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWins = isFinal && (game.awayScore ?? 0) > (game.homeScore ?? 0);
  const date = new Date(game.scheduledAt);

  return (
    <Link
      href={`/partido/${game.id}`}
      className="group relative flex flex-col gap-2 overflow-hidden rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted"
    >
      {isLive && (
        <span className="bg-brand-gradient absolute inset-x-0 top-0 h-0.5" aria-hidden />
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {isLive ? (
          <span className="flex items-center gap-1.5 font-semibold text-primary">
            <span
              className="size-2 rounded-full bg-primary motion-safe:animate-pulse"
              aria-hidden
            />
            EN VIVO
          </span>
        ) : isFinal ? (
          <span>Final</span>
        ) : (
          <span>
            {dateFormat.format(date)} · {timeFormat.format(date)}
          </span>
        )}
      </div>
      <TeamLine
        name={game.away.name}
        color={game.away.color}
        score={game.awayScore}
        winner={awayWins}
      />
      <TeamLine
        name={game.home.name}
        color={game.home.color}
        score={game.homeScore}
        winner={homeWins}
      />
    </Link>
  );
}
