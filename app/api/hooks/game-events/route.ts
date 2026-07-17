import { NextResponse, type NextRequest } from "next/server";
import { sportConfigSchema, type EngineGameEvent } from "@/lib/engine";
import { buildPeriodEndPayload, detectPeriodEnd } from "@/lib/push/payloads";
import { claimPushSlot, getServiceClient, sendPushToFollowers } from "@/lib/push/send";

/**
 * Database Webhook de Supabase: INSERT en game_events. Detecta el fin de
 * cada inning/periodo (primer evento del periodo siguiente) y notifica el
 * marcador a los seguidores. Idempotente vía push_log.
 * Configúralo en Dashboard → Database → Webhooks con el header
 * x-alv-webhook-secret = SUPABASE_WEBHOOK_SECRET.
 */

interface WebhookBody {
  type?: string;
  record?: {
    id: string;
    game_id: string;
    event_type: string;
    period: number | null;
    seq: number;
  };
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  return Boolean(secret) && request.headers.get("x-alv-webhook-secret") === secret;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "No configurado" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as WebhookBody | null;
  const record = body?.record;
  if (body?.type !== "INSERT" || !record) return NextResponse.json({ ok: true });
  if (record.event_type === "correction" || !record.period || record.period <= 1) {
    return NextResponse.json({ ok: true });
  }

  // Eventos previos a este (el candidato es el primer evento del periodo P).
  const { data: prevRows } = await supabase
    .from("game_events")
    .select("id, seq, game_id, team_id, player_id, event_type, payload, period, clock_seconds, corrects_event_id")
    .eq("game_id", record.game_id)
    .lt("seq", record.seq)
    .order("seq");
  const previous = ((prevRows ?? []) as Array<{
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
  }>).map(
    (row): EngineGameEvent => ({
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
    }),
  );

  const endedPeriod = detectPeriodEnd(previous, {
    period: record.period,
    eventType: record.event_type,
  });
  if (endedPeriod === null) return NextResponse.json({ ok: true });

  const claimed = await claimPushSlot(supabase, record.game_id, "period", endedPeriod);
  if (!claimed) return NextResponse.json({ ok: true, deduped: true });

  const { data: gameData } = await supabase
    .from("games")
    .select(
      "id, home_team_id, away_team_id, home:teams!games_home_team_id_fkey(name), away:teams!games_away_team_id_fkey(name), seasons(leagues(sports(config)))",
    )
    .eq("id", record.game_id)
    .single();
  const game = gameData as unknown as {
    id: string;
    home_team_id: string;
    away_team_id: string;
    home: { name: string } | null;
    away: { name: string } | null;
    seasons: { leagues: { sports: { config: unknown } | null } | null } | null;
  } | null;
  if (!game?.seasons?.leagues?.sports) return NextResponse.json({ ok: true });
  const config = sportConfigSchema.parse(game.seasons.leagues.sports.config);

  const payload = buildPeriodEndPayload(
    {
      id: game.id,
      homeTeamId: game.home_team_id,
      awayTeamId: game.away_team_id,
      homeName: game.home?.name ?? "Local",
      awayName: game.away?.name ?? "Visitante",
    },
    previous,
    config,
    endedPeriod,
  );
  const sent = await sendPushToFollowers(
    [game.home_team_id, game.away_team_id],
    payload,
  );
  return NextResponse.json({ ok: true, sent });
}
