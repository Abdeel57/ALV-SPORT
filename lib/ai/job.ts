import "server-only";
import { buildGameAiContext, type GameAiInput } from "./context";
import { buildRecap } from "./recap";
import { type AiStory } from "./schema";
import {
  computePlayerStats,
  sportConfigSchema,
  type EngineGameEvent,
} from "@/lib/engine";
import { sql, type Db, type SqlQuery } from "@/lib/db";
import { getServiceDb } from "@/lib/push/send";

/**
 * Job de generación al finalizar un partido. Cola simple en ai_jobs con
 * reintentos (máximo 3). El resultado SIEMPRE es un borrador: un admin lo
 * revisa, edita y publica — nunca se publica automáticamente.
 */

const MAX_ATTEMPTS = 3;
const EVENT_COLUMNS: SqlQuery = sql`
  id, seq, game_id, team_id, player_id, event_type, payload, period,
  clock_seconds, corrects_event_id
`;

interface EventRow {
  id: string;
  seq: number;
  game_id: string;
  team_id: string | null;
  player_id: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  period: number | null;
  clock_seconds: number | null;
  corrects_event_id: string | null;
}

function mapEvent(row: EventRow): EngineGameEvent {
  return {
    id: row.id,
    seq: row.seq,
    gameId: row.game_id,
    teamId: row.team_id,
    playerId: row.player_id,
    eventType: row.event_type,
    payload: row.payload ?? {},
    period: row.period,
    clockSeconds: row.clock_seconds,
    correctsEventId: row.corrects_event_id,
  };
}

export interface AiJobResult {
  ok: boolean;
  error?: string;
}

export async function runAiJob(
  gameId: string,
  options: { force?: boolean } = {},
): Promise<AiJobResult> {
  const db = getServiceDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };

  // Asegurar el job (idempotente por game_id) y leerlo, en un viaje.
  const job = await db.maybeOne<{
    id: string;
    status: string;
    attempts: number;
    news_id: string | null;
  }>(sql`
    with nuevo as (
      insert into public.ai_jobs (game_id) values (${gameId})
      on conflict (game_id) do nothing
      returning id, status::text as status, attempts, news_id
    )
    select id, status, attempts, news_id from nuevo
    union all
    select id, status::text as status, attempts, news_id
      from public.ai_jobs
     where game_id = ${gameId}
     limit 1
  `);
  if (!job) return { ok: false, error: "No se pudo crear el job" };
  if (!options.force) {
    if (job.status === "done") return { ok: true };
    if (job.attempts >= MAX_ATTEMPTS) {
      return { ok: false, error: "Reintentos agotados (usa Regenerar)" };
    }
  }

  await db.exec(sql`update public.ai_jobs set status = 'running' where id = ${job.id}`);

  try {
    const input = await loadGameInput(db, gameId);
    const context = buildGameAiContext(input);
    const story = buildRecap(input, context);
    const newsId = await saveDraft(db, input, context.records.length, story, job.news_id);
    await db.exec(sql`
      update public.ai_jobs
         set status = 'done', news_id = ${newsId}, error = null
       where id = ${job.id}
    `);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = job.attempts + 1;
    await db.exec(sql`
      update public.ai_jobs
         set status = ${attempts >= MAX_ATTEMPTS ? "failed" : "pending"},
             attempts = ${attempts},
             error = ${message}
       where id = ${job.id}
    `);
    return { ok: false, error: message };
  }
}

async function loadGameInput(db: Db, gameId: string): Promise<GameAiInput> {
  const game = await db.maybeOne<{
    id: string;
    season_id: string;
    scheduled_at: string;
    home_team_id: string;
    away_team_id: string;
    home_name: string | null;
    away_name: string | null;
    season_name: string;
    league_name: string;
    config: unknown;
  }>(sql`
    select g.id, g.season_id, g.scheduled_at, g.home_team_id, g.away_team_id,
           h.name as home_name, a.name as away_name,
           se.name as season_name, l.name as league_name, sp.config
      from public.games g
      left join public.teams h on h.id = g.home_team_id
      left join public.teams a on a.id = g.away_team_id
      join public.seasons se on se.id = g.season_id
      join public.leagues l on l.id = se.league_id
      join public.sports sp on sp.id = l.sport_id
     where g.id = ${gameId}
     limit 1
  `);
  if (!game) {
    throw new Error("No se pudo cargar el partido o su configuración");
  }
  const config = sportConfigSchema.parse(game.config);

  const eventRows = await db.rows<EventRow>(sql`
    select ${EVENT_COLUMNS} from public.game_events
     where game_id = ${gameId}
     order by seq
  `);
  const events = eventRows.map(mapEvent);

  const rosterRows = await db.rows<{
    player_id: string;
    first_name: string | null;
    last_name: string | null;
    team_name: string | null;
  }>(sql`
    select r.player_id, p.first_name, p.last_name, t.name as team_name
      from public.rosters r
      join public.players p on p.id = r.player_id
      left join public.teams t on t.id = r.team_id
     where r.team_id = any(${[game.home_team_id, game.away_team_id]}::uuid[])
  `);
  const playerNames: Record<string, string> = {};
  const playerTeams: Record<string, string> = {};
  for (const row of rosterRows) {
    playerNames[row.player_id] =
      `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
    playerTeams[row.player_id] = row.team_name ?? "";
  }

  // Máximos históricos de la temporada, excluyendo este juego.
  const priorGames = await db.rows<{ id: string }>(sql`
    select id from public.games
     where season_id = ${game.season_id}
       and status = 'finalized'
       and id <> ${gameId}
  `);
  const priorIds = priorGames.map((row) => row.id);
  const seasonMaxes: Record<string, { value: number; holder: string }> = {};
  if (priorIds.length > 0) {
    const priorEventRows = await db.rows<EventRow>(sql`
      select ${EVENT_COLUMNS} from public.game_events
       where game_id = any(${priorIds}::uuid[])
       order by seq
    `);
    const byGame = new Map<string, EngineGameEvent[]>();
    for (const row of priorEventRows) {
      const list = byGame.get(row.game_id) ?? [];
      list.push(mapEvent(row));
      byGame.set(row.game_id, list);
    }
    // Máximo EN UN JUEGO por estadística (récords de partido, no acumulados).
    for (const gameEvents of byGame.values()) {
      const stats = computePlayerStats(gameEvents, config, {
        onUnknownEventType: "ignore",
      });
      for (const [playerId, line] of stats.entries()) {
        for (const [statKey, value] of Object.entries(line)) {
          const current = seasonMaxes[statKey];
          if (!current || value > current.value) {
            seasonMaxes[statKey] = {
              value,
              holder: playerNames[playerId] ?? "otro jugador",
            };
          }
        }
      }
    }
  }

  return {
    game: {
      id: game.id,
      homeTeamId: game.home_team_id,
      awayTeamId: game.away_team_id,
      homeName: game.home_name ?? "Local",
      awayName: game.away_name ?? "Visitante",
      leagueName: game.league_name,
      seasonName: game.season_name,
      scheduledAt: game.scheduled_at,
    },
    config,
    events,
    playerNames,
    playerTeams,
    seasonMaxes,
  };
}

async function saveDraft(
  db: Db,
  input: GameAiInput,
  recordCount: number,
  story: AiStory,
  existingNewsId: string | null,
): Promise<string> {
  const org = await db.maybeOne<{ organization_id: string }>(sql`
    select organization_id from public.teams
     where id = ${input.game.homeTeamId}
     limit 1
  `);
  const organizationId = org?.organization_id;
  if (!organizationId) throw new Error("No se pudo resolver la organización");

  const body = [
    story.resumen,
    "",
    `**MVP:** ${story.mvp.nombre} — ${story.mvp.justificacion}`,
    "",
    `**Jugador destacado:** ${story.destacado.nombre} — ${story.destacado.razon}`,
    ...(recordCount > 0 ? ["", `🏆 Este partido dejó ${recordCount} récord(s) de temporada.`] : []),
    "",
    "---",
    "✍️ Crónica automática — revisar y editar antes de publicar.",
  ].join("\n");

  if (existingNewsId) {
    // Regenerar: sobreescribe el borrador solo si sigue sin publicarse.
    const updated = await db.maybeOne<{ id: string }>(sql`
      update public.news
         set title = ${story.titulo}, body = ${body}
       where id = ${existingNewsId} and status = 'draft'
       returning id
    `);
    if (updated) return existingNewsId;
  }

  const inserted = await db.maybeOne<{ id: string }>(sql`
    insert into public.news
      (organization_id, title, body, status, ai_generated)
    values (${organizationId}, ${story.titulo}, ${body}, 'draft', true)
    returning id
  `);
  if (!inserted) throw new Error("No se pudo guardar el borrador");
  return inserted.id;
}
