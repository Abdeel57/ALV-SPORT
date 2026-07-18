/**
 * Previsualiza la crónica automática (sin IA) de un partido finalizado real.
 *   DATABASE_URL="postgresql://…" pnpm tsx scripts/preview-recap.ts [gameId]
 */
import { Client } from "pg";
import { buildGameAiContext, type GameAiInput } from "../lib/ai/context";
import { buildRecap } from "../lib/ai/recap";
import { sportConfigSchema, type EngineGameEvent } from "../lib/engine";

const EVENT_COLUMNS =
  "id, seq, game_id, team_id, player_id, event_type, payload, period, clock_seconds, corrects_event_id";

interface Row {
  [key: string]: unknown;
}

function mapEvent(r: Row): EngineGameEvent {
  return {
    id: r.id as string,
    seq: Number(r.seq),
    gameId: r.game_id as string,
    teamId: (r.team_id as string) ?? null,
    playerId: (r.player_id as string) ?? null,
    eventType: r.event_type as string,
    payload: (r.payload as Record<string, unknown>) ?? {},
    period: (r.period as number) ?? null,
    clockSeconds: (r.clock_seconds as number) ?? null,
    correctsEventId: (r.corrects_event_id as string) ?? null,
  };
}

async function main(): Promise<void> {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  await db.connect();
  try {
    const gameId =
      process.argv[2] ??
      (
        await db.query(
          "select id from public.games where status='finalized' order by scheduled_at limit 1",
        )
      ).rows[0]?.id;
    if (!gameId) throw new Error("No hay partidos finalizados");

    const { rows: gameRows } = await db.query(
      `select g.id, g.season_id, g.scheduled_at, g.home_team_id, g.away_team_id,
              ht.name as home_name, at.name as away_name,
              s.name as season_name, l.name as league_name, sp.config as config
       from public.games g
       join public.teams ht on ht.id = g.home_team_id
       join public.teams at on at.id = g.away_team_id
       join public.seasons s on s.id = g.season_id
       join public.leagues l on l.id = s.league_id
       join public.sports sp on sp.id = l.sport_id
       where g.id = $1`,
      [gameId],
    );
    const game = gameRows[0];
    const config = sportConfigSchema.parse(game.config);

    const { rows: eventRows } = await db.query(
      `select ${EVENT_COLUMNS} from public.game_events where game_id=$1 order by seq`,
      [gameId],
    );
    const { rows: rosterRows } = await db.query(
      `select r.player_id, p.first_name, p.last_name, t.name as team_name
       from public.rosters r
       join public.players p on p.id = r.player_id
       join public.teams t on t.id = r.team_id
       where r.team_id in ($1,$2)`,
      [game.home_team_id, game.away_team_id],
    );
    const playerNames: Record<string, string> = {};
    const playerTeams: Record<string, string> = {};
    for (const r of rosterRows) {
      playerNames[r.player_id] = `${r.first_name} ${r.last_name}`.trim();
      playerTeams[r.player_id] = r.team_name;
    }

    const input: GameAiInput = {
      game: {
        id: game.id,
        homeTeamId: game.home_team_id,
        awayTeamId: game.away_team_id,
        homeName: game.home_name,
        awayName: game.away_name,
        leagueName: game.league_name,
        seasonName: game.season_name,
        scheduledAt: new Date(game.scheduled_at).toISOString(),
      },
      config,
      events: eventRows.map(mapEvent),
      playerNames,
      playerTeams,
      seasonMaxes: {},
    };

    const story = buildRecap(input, buildGameAiContext(input));
    console.log(`\n== ${game.away_name} @ ${game.home_name} · ${game.league_name} ==\n`);
    console.log(`TÍTULO: ${story.titulo}\n`);
    console.log(story.resumen);
    console.log(`\nMVP: ${story.mvp.nombre} — ${story.mvp.justificacion}`);
    console.log(`Destacado: ${story.destacado.nombre} — ${story.destacado.razon}\n`);
  } finally {
    await db.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
