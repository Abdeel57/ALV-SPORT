import Link from "next/link";
import {
  EmptyState,
  SectionTitle,
} from "@/components/public/bits";
import { GameCard } from "@/components/public/game-card";
import { SponsorStrip } from "@/components/public/sponsor-strip";
import { StandingsTable } from "@/components/public/standings-table";
import { getPublicData } from "@/lib/data";
import { getPublishedNews, getSponsors } from "@/lib/data/extras";

export const revalidate = 60;

interface HomeProps {
  searchParams: Promise<{ liga?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { liga } = await searchParams;
  const [data, homeSponsors, news] = await Promise.all([
    getPublicData().getHome(liga),
    getSponsors("home"),
    getPublishedNews(3),
  ]);

  if (!data) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <EmptyState>
          Aún no hay ligas publicadas. Vuelve pronto — o si eres organizador,
          conecta tu proyecto de Supabase (ver README).
        </EmptyState>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6">
      {/* Selector de liga/temporada */}
      <nav aria-label="Ligas" className="flex flex-wrap items-center gap-2">
        {data.leagues.map((league) => (
          <Link
            key={league.slug}
            href={league.slug === data.leagues[0]?.slug ? "/" : `/?liga=${league.slug}`}
            aria-current={league.slug === data.league.slug ? "page" : undefined}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
              league.slug === data.league.slug
                ? "border-brand-amber/60 bg-secondary font-semibold"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {league.name}
          </Link>
        ))}
        <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
          {data.league.seasonName}
        </span>
      </nav>

      <section aria-labelledby="en-vivo" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="en-vivo">En vivo</span>
        </SectionTitle>
        {data.liveGames.length === 0 ? (
          <EmptyState>
            No hay partidos en vivo ahora mismo. Los marcadores aparecen aquí
            en cuanto la mesa de anotación inicia un partido.
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.liveGames.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="proximos" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="proximos">Próximos partidos</span>
        </SectionTitle>
        {data.upcomingGames.length === 0 ? (
          <EmptyState>No hay partidos programados por ahora.</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.upcomingGames.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="resultados" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="resultados">Resultados recientes</span>
        </SectionTitle>
        {data.recentResults.length === 0 ? (
          <EmptyState>Todavía no hay resultados en esta temporada.</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.recentResults.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="tabla" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="tabla">Tabla general</span>
        </SectionTitle>
        {data.standingsTop.length === 0 ? (
          <EmptyState>La tabla aparecerá cuando haya juegos finalizados.</EmptyState>
        ) : (
          <>
            <StandingsTable rows={data.standingsTop} compact />
            <Link
              href={`/tabla?liga=${data.league.slug}`}
              className="self-start text-sm text-brand-amber hover:underline"
            >
              Ver tabla completa →
            </Link>
          </>
        )}
      </section>

      {news.length > 0 && (
        <section aria-labelledby="noticias" className="flex flex-col gap-3">
          <SectionTitle>
            <span id="noticias">Noticias</span>
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            {news.map((item) => (
              <article key={item.id} className="flex flex-col gap-2 overflow-hidden rounded-xl border bg-card">
                {item.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" className="h-32 w-full object-cover" />
                )}
                <div className="flex flex-col gap-1 px-4 pt-2 pb-4">
                  <h3 className="font-display text-lg leading-snug">{item.title}</h3>
                  <p className="line-clamp-3 text-sm text-muted-foreground">{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <SponsorStrip sponsors={homeSponsors} />

      <section aria-labelledby="destacados" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="destacados">Jugadores destacados</span>
        </SectionTitle>
        {data.topPlayers.length === 0 ? (
          <EmptyState>Los líderes aparecerán con los primeros juegos.</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.topPlayers.map((player) => (
              <Link
                key={player.playerId}
                href={`/jugador/${player.playerId}`}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{player.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {player.team.name}
                  </span>
                </span>
                <span className="flex flex-col items-end">
                  <span className="font-display text-2xl text-brand-amber tabular-nums">
                    {player.value}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {player.statLabel}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
