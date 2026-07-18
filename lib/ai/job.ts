import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildGameAiContext, type GameAiInput } from "./context";
import { buildRecap } from "./recap";
import { type AiStory } from "./schema";
import {
  computePlayerStats,
  sportConfigSchema,
  type EngineGameEvent,
} from "@/lib/engine";
import { getServiceClient } from "@/lib/push/send";

/**
 * Job de generación al finalizar un partido. Cola simple en ai_jobs con
 * reintentos (máximo 3). El resultado SIEMPRE es un borrador: un admin lo
 * revisa, edita y publica — nunca se publica automáticamente.
 */

const MAX_ATTEMPTS = 3;
const EVENT_COLUMNS =
  "id, seq, game_id, team_id, player_id, event_type, payload, period, clock_seconds, corrects_event_id";

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
  const supabase = getServiceClient();
  if (!supabase) return { ok: false, error: "Supabase no configurado" };

  // Asegurar el job (idempotente por game_id).
  await supabase.from("ai_jobs").insert({ game_id: gameId }).select().maybeSingle();
  const { data: jobData } = await supabase
    .from("ai_jobs")
    .select("id, status, attempts, news_id")
    .eq("game_id", gameId)
    .single();
  const job = jobData as {
    id: string;
    status: string;
    attempts: number;
    news_id: string | null;
  } | null;
  if (!job) return { ok: false, error: "No se pudo crear el job" };
  if (!options.force) {
    if (job.status === "done") return { ok: true };
    if (job.attempts >= MAX_ATTEMPTS) {
      return { ok: false, error: "Reintentos agotados (usa Regenerar)" };
    }
  }

  await supabase.from("ai_jobs").update({ status: "running" }).eq("id", job.id);

  try {
    const input = await loadGameInput(supabase, gameId);
    const context = buildGameAiContext(input);
    const story = buildRecap(input, context);
    const newsId = await saveDraft(supabase, input, context.records.length, story, job.news_id);
    await supabase
      .from("ai_jobs")
      .update({ status: "done", news_id: newsId, error: null })
      .eq("id", job.id);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = job.attempts + 1;
    await supabase
      .from("ai_jobs")
      .update({
        status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        attempts,
        error: message,
      })
      .eq("id", job.id);
    return { ok: false, error: message };
  }
}

async function loadGameInput(
  supabase: SupabaseClient,
  gameId: string,
): Promise<GameAiInput> {
  const { data: gameData } = await supabase
    .from("games")
    .select(
      "id, season_id, scheduled_at, home_team_id, away_team_id, home:teams!games_home_team_id_fkey(id,name), away:teams!games_away_team_id_fkey(id,name), seasons(name, leagues(name, sports(config)))",
    )
    .eq("id", gameId)
    .single();
  const game = gameData as unknown as {
    id: string;
    season_id: string;
    scheduled_at: string;
    home_team_id: string;
    away_team_id: string;
    home: { id: string; name: string } | null;
    away: { id: string; name: string } | null;
    seasons: {
      name: string;
      leagues: { name: string; sports: { config: unknown } | null } | null;
    } | null;
  } | null;
  if (!game?.seasons?.leagues?.sports) {
    throw new Error("No se pudo cargar el partido o su configuración");
  }
  const config = sportConfigSchema.parse(game.seasons.leagues.sports.config);

  const { data: eventRows } = await supabase
    .from("game_events")
    .select(EVENT_COLUMNS)
    .eq("game_id", gameId)
    .order("seq");
  const events = ((eventRows ?? []) as EventRow[]).map(mapEvent);

  const { data: rosterRows } = await supabase
    .from("rosters")
    .select("player_id, team_id, players(first_name, last_name), teams(name)")
    .in("team_id", [game.home_team_id, game.away_team_id]);
  const playerNames: Record<string, string> = {};
  const playerTeams: Record<string, string> = {};
  for (const row of (rosterRows ?? []) as unknown as Array<{
    player_id: string;
    players: { first_name: string; last_name: string } | null;
    teams: { name: string } | null;
  }>) {
    playerNames[row.player_id] =
      `${row.players?.first_name ?? ""} ${row.players?.last_name ?? ""}`.trim();
    playerTeams[row.player_id] = row.teams?.name ?? "";
  }

  // Máximos históricos de la temporada, excluyendo este juego.
  const { data: priorGames } = await supabase
    .from("games")
    .select("id")
    .eq("season_id", game.season_id)
    .eq("status", "finalized")
    .neq("id", gameId);
  const priorIds = ((priorGames ?? []) as { id: string }[]).map((g) => g.id);
  const seasonMaxes: Record<string, { value: number; holder: string }> = {};
  if (priorIds.length > 0) {
    const { data: priorEventRows } = await supabase
      .from("game_events")
      .select(EVENT_COLUMNS)
      .in("game_id", priorIds)
      .order("seq");
    const byGame = new Map<string, EngineGameEvent[]>();
    for (const row of (priorEventRows ?? []) as EventRow[]) {
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
      homeName: game.home?.name ?? "Local",
      awayName: game.away?.name ?? "Visitante",
      leagueName: game.seasons.leagues.name,
      seasonName: game.seasons.name,
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
  supabase: SupabaseClient,
  input: GameAiInput,
  recordCount: number,
  story: AiStory,
  existingNewsId: string | null,
): Promise<string> {
  const { data: orgData } = await supabase
    .from("teams")
    .select("organization_id")
    .eq("id", input.game.homeTeamId)
    .single();
  const organizationId = (orgData as { organization_id: string } | null)
    ?.organization_id;
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
    const { data: updated } = await supabase
      .from("news")
      .update({ title: story.titulo, body })
      .eq("id", existingNewsId)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (updated) return existingNewsId;
  }

  const { data: inserted, error } = await supabase
    .from("news")
    .insert({
      organization_id: organizationId,
      title: story.titulo,
      body,
      status: "draft",
      ai_generated: true,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    throw new Error(error?.message ?? "No se pudo guardar el borrador");
  }
  return (inserted as { id: string }).id;
}
