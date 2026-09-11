import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { sportConfigSchema, type EngineGameEvent } from "@/lib/engine";
import { buildPeriodEndPayload, detectPeriodEnd } from "@/lib/push/payloads";
import { claimPushSlot, getServiceDb, sendPushToFollowers } from "@/lib/push/send";

/**
 * Webhook interno: INSERT en game_events. Lo dispara un trigger de Postgres
 * con pg_net (una extensión, no un servicio). Detecta el fin de cada
 * inning/periodo (primer evento del periodo siguiente) y notifica el
 * marcador a los seguidores. Idempotente vía push_log.
 * El secreto compartido viaja en el header x-alv-webhook-secret.
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
  // WEBHOOK_SECRET es el nombre nuevo; se acepta el anterior para no romper
  // entornos ya configurados.
  const secret = process.env.WEBHOOK_SECRET ?? process.env.SUPABASE_WEBHOOK_SECRET;
  return Boolean(secret) && request.headers.get("x-alv-webhook-secret") === secret;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const db = getServiceDb();
  if (!db) return NextResponse.json({ error: "No configurado" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as WebhookBody | null;
  const record = body?.record;
  if (body?.type !== "INSERT" || !record) return NextResponse.json({ ok: true });
  if (record.event_type === "correction" || !record.period || record.period <= 1) {
    return NextResponse.json({ ok: true });
  }

  // Eventos previos a este (el candidato es el primer evento del periodo P).
  const prevRows = await db.rows<{
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
  }>(sql`
    select id, seq, game_id, team_id, player_id, event_type, payload, period,
           clock_seconds, corrects_event_id
      from public.game_events
     where game_id = ${record.game_id} and seq < ${record.seq}
     order by seq
  `);
  const previous = prevRows.map(
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

  const claimed = await claimPushSlot(db, record.game_id, "period", endedPeriod);
  if (!claimed) return NextResponse.json({ ok: true, deduped: true });

  const game = await db.maybeOne<{
    id: string;
    home_team_id: string;
    away_team_id: string;
    home_name: string | null;
    away_name: string | null;
    config: unknown;
  }>(sql`
    select g.id, g.home_team_id, g.away_team_id,
           h.name as home_name, a.name as away_name, sp.config
      from public.games g
      left join public.teams h on h.id = g.home_team_id
      left join public.teams a on a.id = g.away_team_id
      join public.seasons se on se.id = g.season_id
      join public.leagues l on l.id = se.league_id
      join public.sports sp on sp.id = l.sport_id
     where g.id = ${record.game_id}
     limit 1
  `);
  if (!game) return NextResponse.json({ ok: true });
  const config = sportConfigSchema.parse(game.config);

  const payload = buildPeriodEndPayload(
    {
      id: game.id,
      homeTeamId: game.home_team_id,
      awayTeamId: game.away_team_id,
      homeName: game.home_name ?? "Local",
      awayName: game.away_name ?? "Visitante",
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
