import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandLoader } from "@/components/brand/brand-loader";
import { EmptyState, LeagueChips, SectionTitle } from "@/components/public/bits";
import { StatsLeaderboard } from "@/components/public/stats-leaderboard";
import { getPublicData } from "@/lib/data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Estadísticas",
  description: "Líderes estadísticos por liga y temporada.",
};

interface PageProps {
  searchParams: Promise<{ liga?: string }>;
}

export default async function EstadisticasPage({ searchParams }: PageProps) {
  const { liga } = await searchParams;
  return (
    <Suspense key={liga ?? "principal"} fallback={<BrandLoader variant="seccion" />}>
      <EstadisticasContent liga={liga} />
    </Suspense>
  );
}

async function EstadisticasContent({ liga }: { liga: string | undefined }) {
  const provider = getPublicData();
  const [stats, leagues] = await Promise.all([
    provider.getLeagueStats(liga),
    provider.getLeagues(),
  ]);

  if (!stats) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <EmptyState>Aún no hay ligas publicadas.</EmptyState>
      </main>
    );
  }

  const hasLeaders = stats.categories.some((category) => category.leaders.length > 0);

  return (
    <main className="stagger mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <SectionTitle>Estadísticas</SectionTitle>
      <LeagueChips
        leagues={leagues}
        activeSlug={stats.league.slug}
        hrefFor={(slug) => `/estadisticas?liga=${slug}`}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="whitespace-nowrap">{stats.league.seasonName}</span>
        <span className="flex items-center gap-4 whitespace-nowrap">
          <span aria-hidden>·</span>
          {stats.finalizedGames} juegos finalizados
        </span>
        <span className="flex items-center gap-4 whitespace-nowrap">
          <span aria-hidden>·</span>
          {stats.playersWithStats} jugadores con registro
        </span>
      </div>

      {!hasLeaders ? (
        <EmptyState>
          Las estadísticas aparecerán cuando se finalicen partidos con jugadas
          asignadas a jugadores.
        </EmptyState>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {stats.categories.map((category) => (
            <StatsLeaderboard key={category.key} category={category} />
          ))}
        </div>
      )}
    </main>
  );
}
