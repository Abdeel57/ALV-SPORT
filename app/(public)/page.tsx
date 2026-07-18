import Link from "next/link";
import { EmptyState, LeagueChips, SectionTitle } from "@/components/public/bits";
import { GameCard } from "@/components/public/game-card";
import { HeroGame } from "@/components/public/hero-game";
import { JoinCta } from "@/components/public/join-cta";
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

  // La marquesina toma el partido más relevante: en vivo → próximo → último.
  const hero =
    data.liveGames[0] ?? data.upcomingGames[0] ?? data.recentResults[0] ?? null;
  const liveRest = data.liveGames.filter((game) => game.id !== hero?.id);
  const upcomingRest = data.upcomingGames.filter((game) => game.id !== hero?.id);
  const resultsRest = data.recentResults.filter((game) => game.id !== hero?.id);

  return (
    <main className="stagger mx-auto flex w-full max-w-5xl flex-col gap-9 px-4 py-6">
      <LeagueChips
        leagues={data.leagues}
        activeSlug={data.league.slug}
        hrefFor={(slug, index) => (index === 0 ? "/" : `/?liga=${slug}`)}
        trailing={
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
            {data.league.seasonName}
          </span>
        }
      />

      {hero && (
        <section aria-label="Partido destacado">
          <HeroGame
            game={hero}
            leagueName={data.league.name}
            seasonName={data.league.seasonName}
          />
        </section>
      )}

      <JoinCta />

      {liveRest.length > 0 && (
        <section aria-labelledby="en-vivo" className="flex flex-col gap-3.5">
          <SectionTitle>
            <span id="en-vivo">En vivo</span>
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveRest.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="proximos" className="flex flex-col gap-3.5">
        <SectionTitle>
          <span id="proximos">Próximos partidos</span>
        </SectionTitle>
        {upcomingRest.length === 0 ? (
          <EmptyState>No hay más partidos programados por ahora.</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingRest.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="resultados" className="flex flex-col gap-3.5">
        <SectionTitle>
          <span id="resultados">Resultados recientes</span>
        </SectionTitle>
        {resultsRest.length === 0 ? (
          <EmptyState>Todavía no hay resultados en esta temporada.</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {resultsRest.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="tabla" className="flex flex-col gap-3.5">
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
              className="self-start text-sm text-brand-amber transition-transform duration-200 hover:translate-x-0.5"
            >
              Ver tabla completa →
            </Link>
          </>
        )}
      </section>

      {news.length > 0 && (
        <section aria-labelledby="noticias" className="flex flex-col gap-3.5">
          <SectionTitle>
            <span id="noticias">Noticias</span>
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            {news.map((item) => (
              <article
                key={item.id}
                className="card-elevated sheen hover-lift group flex flex-col overflow-hidden rounded-xl"
              >
                {item.imageUrl && (
                  <div className="overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-36 w-full object-cover transition-transform duration-200 motion-safe:group-hover:scale-[1.04]"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5 px-4 pt-3 pb-4">
                  <h3 className="font-display text-lg leading-snug">{item.title}</h3>
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <SponsorStrip sponsors={homeSponsors} />

      <section aria-labelledby="destacados" className="flex flex-col gap-3.5">
        <SectionTitle>
          <span id="destacados">Jugadores destacados</span>
        </SectionTitle>
        {data.topPlayers.length === 0 ? (
          <EmptyState>Los líderes aparecerán con los primeros juegos.</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.topPlayers.map((player, index) => (
              <Link
                key={player.playerId}
                href={`/jugador/${player.playerId}`}
                className="card-elevated sheen hover-lift relative flex items-center justify-between gap-3 overflow-hidden rounded-xl px-4 py-3.5"
              >
                <span
                  aria-hidden
                  className="font-display pointer-events-none absolute -top-1 right-1 text-6xl text-white/[0.05] tabular-nums"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="relative flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{player.name}</span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: player.team.color ?? "#666" }}
                      aria-hidden
                    />
                    <span className="truncate text-xs text-muted-foreground">
                      {player.team.name}
                    </span>
                  </span>
                </span>
                <span className="relative flex flex-col items-end">
                  <span className="font-display text-3xl leading-none text-brand-amber tabular-nums">
                    {player.value}
                  </span>
                  <span className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
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
