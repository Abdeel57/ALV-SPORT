import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandLoader } from "@/components/brand/brand-loader";
import { EmptyState, LeagueChips, SectionTitle } from "@/components/public/bits";
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
  // Mismo patrón que el home: boundary con key por liga para que el cambio de
  // pestaña muestre la pantalla de carga al instante en vez de congelarse.
  return (
    <Suspense key={liga ?? "principal"} fallback={<BrandLoader variant="seccion" />}>
      <TablaContent liga={liga} />
    </Suspense>
  );
}

async function TablaContent({ liga }: { liga: string | undefined }) {
  const provider = getPublicData();
  const [standings, leagues] = await Promise.all([
    provider.getStandings(liga),
    provider.getLeagues(),
  ]);

  return (
    <main className="stagger mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6">
      <SectionTitle>Tabla general</SectionTitle>
      <LeagueChips
        leagues={leagues}
        activeSlug={standings?.league.slug}
        hrefFor={(slug) => `/tabla?liga=${slug}`}
      />
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
