import Link from "next/link";
import { TeamBadge } from "@/components/public/team-badge";
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
  logoUrl,
  score,
  winner,
  decided,
}: {
  name: string;
  color: string | null;
  logoUrl?: string | null;
  score: number | null;
  winner: boolean;
  decided: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2.5">
        <TeamBadge
          name={name}
          color={color}
          logoUrl={logoUrl}
          className="size-7 text-[11px]"
        />
        <span
          className={`truncate text-sm ${
            winner ? "font-semibold" : decided ? "text-muted-foreground" : ""
          }`}
        >
          {name}
        </span>
      </span>
      {score !== null && (
        <span
          className={`font-display text-2xl leading-none tabular-nums ${
            winner ? "text-brand-amber" : decided ? "text-muted-foreground" : ""
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
  const decided = homeWins || awayWins;
  const date = new Date(game.scheduledAt);

  return (
    <Link
      href={`/partido/${game.id}`}
      className={`card-elevated sheen hover-lift group relative flex flex-col gap-2.5 rounded-xl px-4 py-3.5 ${
        isLive ? "border-brand-red/35" : ""
      }`}
    >
      {isLive && (
        <span className="live-bar absolute inset-x-0 top-0 h-0.5" aria-hidden />
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {isLive ? (
          <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.18em] text-primary uppercase">
            <span className="live-dot size-2" aria-hidden />
            En vivo
          </span>
        ) : isFinal ? (
          <span className="border-brand-silver/25 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
            Final
          </span>
        ) : (
          <span className="tracking-wide tabular-nums">
            {dateFormat.format(date)} · {timeFormat.format(date)}
          </span>
        )}
        <span
          aria-hidden
          className="text-brand-silver/0 transition-colors duration-200 group-hover:text-brand-silver/80"
        >
          →
        </span>
      </div>
      <TeamLine
        name={game.away.name}
        color={game.away.color}
        logoUrl={game.away.logoUrl}
        score={game.awayScore}
        winner={awayWins}
        decided={decided}
      />
      <TeamLine
        name={game.home.name}
        color={game.home.color}
        logoUrl={game.home.logoUrl}
        score={game.homeScore}
        winner={homeWins}
        decided={decided}
      />
    </Link>
  );
}
