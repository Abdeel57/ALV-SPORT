import type { Metadata } from "next";
import { AnotadorConsole } from "@/components/anotador/console";
import type { ConsoleTeam } from "@/components/anotador/types";
import { SLOWPITCH_RULES } from "@/lib/engine/scorebook";
import {
  SEED_ADMIN_USER_ID,
  gameId,
  leagues,
  players,
  rosters,
  seasons,
  softballConfig,
  softballGames,
  teams,
} from "@/lib/seed-data";
import { compareJerseyNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Demo de la mesa de anotación" };

/*
 * Demo 100% local de la mesa de anotación con el partido seed que sigue
 * programado (juego 10: Mineros @ Halcones). Sin base de datos: los eventos se
 * quedan en la cola de IndexedDB ("Modo demo") y la recuperación al recargar
 * funciona exactamente igual que en producción.
 */

const DEMO_GAME_ID = gameId(10);

function buildTeam(teamId: string): ConsoleTeam {
  const team = teams.find((t) => t.id === teamId);
  const playerById = new Map(players.map((p) => [p.id, p]));
  const roster = rosters
    .filter((entry) => entry.teamId === teamId)
    .map((entry) => {
      const player = playerById.get(entry.playerId);
      return {
        playerId: entry.playerId,
        firstName: player?.firstName ?? "—",
        lastName: player?.lastName ?? "",
        jerseyNumber: entry.jerseyNumber,
        position: entry.position,
      };
    })
    .sort((a, b) => compareJerseyNumber(a.jerseyNumber, b.jerseyNumber) || a.lastName.localeCompare(b.lastName));
  return {
    id: teamId,
    name: team?.name ?? "Equipo",
    color: team?.color ?? null,
    roster,
  };
}

export default function AnotadorDemoPage() {
  const game = softballGames.find((g) => g.id === DEMO_GAME_ID);
  if (!game) throw new Error("El seed no tiene el juego demo");
  const season = seasons.find((s) => s.id === game.seasonId);
  const league = leagues.find((l) => l.id === season?.leagueId);

  return (
    <AnotadorConsole
      mode="demo"
      userId={SEED_ADMIN_USER_ID}
      game={{
        id: game.id,
        status: "scheduled",
        scheduledAt: game.scheduledAt,
        leagueName: league?.name ?? "Liga demo",
        seasonName: season?.name ?? "Temporada demo",
      }}
      homeTeam={buildTeam(game.homeTeamId)}
      awayTeam={buildTeam(game.awayTeamId)}
      sportKey="softball"
      sportConfig={softballConfig}
      rules={SLOWPITCH_RULES}
      rulesSource="default"
      initialEvents={[]}
    />
  );
}
