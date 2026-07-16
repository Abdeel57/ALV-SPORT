import type { Metadata } from "next";
import { EmptyState } from "@/components/public/bits";
import { GameView } from "@/components/partido/game-view";
import { SponsorStrip } from "@/components/public/sponsor-strip";
import { getPublicData } from "@/lib/data";
import { getSponsors } from "@/lib/data/extras";

/**
 * SSR/ISR: los partidos finalizados se sirven estáticos con revalidación;
 * un partido en vivo se actualiza en el cliente vía Realtime (GameView).
 */
export const revalidate = 300;

interface PageProps {
  params: Promise<{ gameId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { gameId } = await params;
  const detail = await getPublicData().getGameDetail(gameId);
  if (!detail) return { title: "Partido no encontrado" };
  const { game } = detail;
  const title = `${game.away.name} vs ${game.home.name}`;
  const description =
    game.status === "finalized"
      ? `Final: ${game.away.name} ${game.awayScore ?? 0} — ${game.homeScore ?? 0} ${game.home.name} · ${detail.league.name}`
      : game.status === "in_progress"
        ? `EN VIVO: ${game.away.name} ${game.awayScore ?? 0} — ${game.homeScore ?? 0} ${game.home.name} · ${detail.league.name}`
        : `${detail.league.name} · ${detail.league.seasonName}`;
  return {
    title,
    description,
    openGraph: {
      title: `${title} — ALV SPORT`,
      description,
      type: "website",
      locale: "es_MX",
    },
  };
}

export default async function PartidoPage({ params }: PageProps) {
  const { gameId } = await params;
  const provider = getPublicData();
  const [detail, gameSponsors] = await Promise.all([
    provider.getGameDetail(gameId),
    getSponsors("game"),
  ]);

  if (!detail) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <EmptyState>
          El partido no existe o su liga no está publicada.
        </EmptyState>
      </main>
    );
  }

  return (
    <>
      <GameView detail={detail} realtime={provider.isLive} />
      {gameSponsors.length > 0 && (
        <div className="mx-auto w-full max-w-4xl px-4 pb-8">
          <SponsorStrip sponsors={gameSponsors} />
        </div>
      )}
    </>
  );
}
