import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, SectionTitle } from "@/components/public/bits";
import { GameCard } from "@/components/public/game-card";
import { getPublicData } from "@/lib/data";

export const metadata: Metadata = { title: "Buscar" };

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function BuscarPage({ searchParams }: PageProps) {
  const { q = "" } = await searchParams;
  const results = await getPublicData().search(q);
  const hasResults =
    results.teams.length > 0 ||
    results.players.length > 0 ||
    results.games.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <SectionTitle>
        {q.trim().length >= 2 ? `Resultados para “${q}”` : "Buscar"}
      </SectionTitle>

      {q.trim().length < 2 ? (
        <EmptyState>
          Escribe al menos dos letras en el buscador del encabezado para
          encontrar equipos, jugadores y partidos.
        </EmptyState>
      ) : !hasResults ? (
        <EmptyState>
          Sin resultados para “{q}”. Intenta con otro nombre.
        </EmptyState>
      ) : (
        <>
          {results.teams.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs tracking-widest text-muted-foreground uppercase">
                Equipos
              </h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {results.teams.map((team) => (
                  <li key={team.id}>
                    <Link
                      href={`/equipo/${team.slug}`}
                      className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted"
                    >
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: team.color ?? "#666" }}
                        aria-hidden
                      />
                      <span className="truncate font-medium">{team.name}</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {team.leagueName}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.players.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs tracking-widest text-muted-foreground uppercase">
                Jugadores
              </h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {results.players.map((player) => (
                  <li key={player.playerId}>
                    <Link
                      href={`/jugador/${player.playerId}`}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted"
                    >
                      <span className="truncate font-medium">{player.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {player.teamName}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.games.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs tracking-widest text-muted-foreground uppercase">
                Partidos
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {results.games.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
