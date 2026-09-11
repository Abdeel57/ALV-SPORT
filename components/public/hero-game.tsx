import Link from "next/link";
import { SponsorPresenter } from "@/components/public/sponsor-presenter";
import { TeamBadge } from "@/components/public/team-badge";
import type { PublicSponsor } from "@/lib/data/extras";
import type { GameSummary } from "@/lib/data/types";

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

/**
 * Marquesina de portada: el partido más relevante (en vivo → próximo →
 * último resultado) como marcador de transmisión, teñido por los colores
 * oficiales de ambos equipos en paneles diagonales.
 */
export function HeroGame({
  game,
  leagueName,
  seasonName,
  presenter = null,
}: {
  game: GameSummary;
  leagueName: string;
  seasonName: string;
  /** Patrocinador principal para el lugar "Presenta". */
  presenter?: PublicSponsor | null;
}) {
  const isLive = game.status === "in_progress";
  const isFinal = game.status === "finalized";
  const away = game.away;
  const home = game.home;
  const awayTint = away.color ?? "#666";
  const homeTint = home.color ?? "#666";
  const label = isLive ? "En vivo" : isFinal ? "Último resultado" : "Próximo juego";

  return (
    <Link
      href={`/partido/${game.id}`}
      aria-label={`${label}: ${away.name} contra ${home.name}`}
      className={`card-elevated sheen hover-lift group relative block overflow-hidden rounded-2xl ${
        isLive ? "border-brand-red/35" : ""
      }`}
    >
      {isLive ? (
        <span className="live-bar absolute inset-x-0 top-0 h-1" aria-hidden />
      ) : (
        <span
          className="bg-brand-gradient absolute inset-x-0 top-0 h-1 opacity-35"
          aria-hidden
        />
      )}
      {/* Paneles diagonales con los colores oficiales */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(105deg, ${awayTint}2e 0%, transparent 42%, transparent 58%, ${homeTint}2e 100%)`,
        }}
      />
      <span
        aria-hidden
        className="absolute -top-20 -left-20 size-64 rounded-full blur-3xl"
        style={{ backgroundColor: `${awayTint}1f` }}
      />
      <span
        aria-hidden
        className="absolute -right-20 -bottom-20 size-64 rounded-full blur-3xl"
        style={{ backgroundColor: `${homeTint}1f` }}
      />

      <div className="relative flex flex-col gap-4 px-4 py-5 sm:px-8 sm:py-7">
        <div className="flex items-center justify-between gap-2 text-xs">
          {isLive ? (
            <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.18em] text-primary uppercase">
              <span className="live-dot size-2" aria-hidden />
              En vivo
            </span>
          ) : (
            <span className="border-brand-silver/25 rounded-sm border px-2 py-0.5 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              {label}
            </span>
          )}
          <span className="truncate text-muted-foreground">
            {leagueName} · {seasonName}
          </span>
        </div>

        <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-6">
          <span className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 sm:text-left">
            <TeamBadge
              name={away.name}
              color={away.color}
              logoUrl={away.logoUrl}
              glow
              className="size-12 text-xl sm:size-16 sm:text-3xl"
            />
            <span className="font-display line-clamp-2 text-sm leading-tight sm:line-clamp-none sm:truncate sm:text-3xl">
              {away.name}
            </span>
          </span>

          {isLive || isFinal ? (
            <span className="font-display flex shrink-0 items-baseline gap-2 pt-1 text-5xl tabular-nums sm:gap-3 sm:pt-0 sm:text-7xl">
              <span>{game.awayScore ?? 0}</span>
              <span className="text-xl text-muted-foreground sm:text-3xl">–</span>
              <span>{game.homeScore ?? 0}</span>
            </span>
          ) : (
            <span
              aria-hidden
              className="font-display bg-brand-gradient shrink-0 bg-clip-text text-4xl text-transparent sm:text-6xl"
            >
              VS
            </span>
          )}

          <span className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center sm:flex-row-reverse sm:gap-3 sm:text-right">
            <TeamBadge
              name={home.name}
              color={home.color}
              logoUrl={home.logoUrl}
              glow
              className="size-12 text-xl sm:size-16 sm:text-3xl"
            />
            <span className="font-display line-clamp-2 text-sm leading-tight sm:line-clamp-none sm:truncate sm:text-3xl">
              {home.name}
            </span>
          </span>
        </div>

        {presenter && <SponsorPresenter sponsor={presenter} />}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">
            {dateFormat.format(new Date(game.scheduledAt))}
          </span>
          <span className="text-brand-amber transition-transform duration-200 group-hover:translate-x-0.5">
            Ver partido →
          </span>
        </div>
      </div>
    </Link>
  );
}
