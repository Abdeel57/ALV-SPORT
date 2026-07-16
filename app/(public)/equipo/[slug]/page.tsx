import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, SectionTitle } from "@/components/public/bits";
import { GameCard } from "@/components/public/game-card";
import { Badge } from "@/components/ui/badge";
import { getPublicData } from "@/lib/data";

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicData().getTeamProfile(slug);
  return {
    title: profile ? profile.team.name : "Equipo no encontrado",
    description: profile
      ? `${profile.team.name} — plantilla, calendario y resultados en ${profile.league.name}.`
      : undefined,
  };
}

const streakStyle: Record<"W" | "L" | "T", string> = {
  W: "bg-primary/15 text-primary border-primary/40",
  L: "bg-muted text-muted-foreground border-border",
  T: "bg-brand-amber/15 text-brand-amber border-brand-amber/40",
};
const streakLabel: Record<"W" | "L" | "T", string> = {
  W: "G",
  L: "P",
  T: "E",
};

export default async function EquipoPage({ params }: PageProps) {
  const { slug } = await params;
  const profile = await getPublicData().getTeamProfile(slug);

  if (!profile) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <EmptyState>El equipo no existe o su liga no está publicada.</EmptyState>
      </main>
    );
  }

  const { team, league, standing, roster, games, streak } = profile;
  const upcoming = games.filter((game) => game.status === "scheduled");
  const results = games.filter((game) => game.status !== "scheduled").reverse();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      {/* Header del equipo: su color oficial como acento */}
      <section
        className="flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border px-4 py-5 sm:px-6"
        style={{
          backgroundImage: `linear-gradient(120deg, ${team.color ?? "#666"}26 0%, transparent 55%)`,
        }}
      >
        <span
          aria-hidden
          className="flex size-16 items-center justify-center rounded-full border font-display text-3xl"
          style={{
            backgroundColor: `${team.color ?? "#666"}26`,
            borderColor: `${team.color ?? "#666"}66`,
          }}
        >
          {team.name.slice(0, 1)}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-3xl sm:text-4xl">{team.name}</h1>
          <p className="text-sm text-muted-foreground">
            {league.name} · {league.seasonName}
          </p>
        </div>
        {standing && (
          <div className="ml-auto flex items-center gap-4 text-center tabular-nums">
            <div>
              <p className="font-display text-2xl">#{standing.rank}</p>
              <p className="text-xs text-muted-foreground">Posición</p>
            </div>
            <div>
              <p className="font-display text-2xl">
                {standing.wins}-{standing.losses}
              </p>
              <p className="text-xs text-muted-foreground">Récord</p>
            </div>
            <div>
              <p className="font-display text-2xl">{standing.points}</p>
              <p className="text-xs text-muted-foreground">Puntos</p>
            </div>
          </div>
        )}
      </section>

      {streak.length > 0 && (
        <section aria-label="Racha" className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Racha reciente:</span>
          <div className="flex gap-1.5">
            {streak.map((result, index) => (
              <span
                key={index}
                className={`flex size-8 items-center justify-center rounded-full border text-xs font-bold ${streakStyle[result]}`}
                aria-label={result === "W" ? "Victoria" : result === "L" ? "Derrota" : "Empate"}
              >
                {streakLabel[result]}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle>Plantilla</SectionTitle>
        {roster.length === 0 ? (
          <EmptyState>Sin jugadores registrados.</EmptyState>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {roster.map((player) => (
              <li key={player.playerId}>
                <Link
                  href={`/jugador/${player.playerId}`}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted"
                >
                  <span
                    className="w-8 text-center font-display text-lg tabular-nums"
                    style={{ color: team.color ?? undefined }}
                  >
                    {player.jerseyNumber ?? "—"}
                  </span>
                  <span className="truncate">{player.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Calendario</SectionTitle>
        {upcoming.length === 0 ? (
          <EmptyState>No hay partidos programados.</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Últimos resultados</SectionTitle>
        {results.length === 0 ? (
          <EmptyState>Todavía no hay resultados.</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}
        <Badge variant="outline" className="self-start text-muted-foreground">
          {results.length} jugados · {upcoming.length} por jugar
        </Badge>
      </section>
    </main>
  );
}
