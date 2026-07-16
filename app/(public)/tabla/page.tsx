import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, SectionTitle } from "@/components/public/bits";
import { StandingsTable } from "@/components/public/standings-table";
import { getPublicData } from "@/lib/data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Tabla general",
  description:
    "Tabla de posiciones con reglas de desempate oficiales de cada deporte.",
};

interface PageProps {
  searchParams: Promise<{ liga?: string }>;
}

export default async function TablaPage({ searchParams }: PageProps) {
  const { liga } = await searchParams;
  const provider = getPublicData();
  const [standings, leagues] = await Promise.all([
    provider.getStandings(liga),
    provider.getLeagues(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6">
      <SectionTitle>Tabla general</SectionTitle>
      <nav aria-label="Ligas" className="flex flex-wrap gap-2">
        {leagues.map((league) => (
          <Link
            key={league.slug}
            href={`/tabla?liga=${league.slug}`}
            aria-current={league.slug === standings?.league.slug ? "page" : undefined}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
              league.slug === standings?.league.slug
                ? "border-brand-amber/60 bg-secondary font-semibold"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {league.name}
          </Link>
        ))}
      </nav>
      {!standings || standings.rows.length === 0 ? (
        <EmptyState>
          La tabla aparecerá cuando haya juegos finalizados en esta temporada.
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {standings.league.seasonName} · desempates: head-to-head,
            diferencial y anotación a favor (según configuración del deporte).
          </p>
          <StandingsTable rows={standings.rows} />
        </>
      )}
    </main>
  );
}
