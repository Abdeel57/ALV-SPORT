import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { insertRows, sql, type SqlValue } from "@/lib/db";
import { getDb } from "@/lib/db/request";

/**
 * Eventos de la mesa de anotación.
 *
 * Antes el navegador escribía directo en la base a través de PostgREST;
 * ahora pasa por aquí. Las reglas NO cambian: la consulta corre con la
 * identidad del anotador, así que las mismas políticas RLS deciden si
 * puede insertar (asignado + partido en progreso, o admin de la liga).
 */

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  id: z.uuid(),
  gameId: z.uuid(),
  teamId: z.uuid().nullable(),
  playerId: z.uuid().nullable(),
  eventType: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()),
  period: z.number().int().min(1).max(999).nullable(),
  clockSeconds: z.number().int().min(0).nullable(),
  correctsEventId: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

const bodySchema = z.object({
  events: z.array(eventSchema).min(1).max(200),
});

function failed(error: unknown): NextResponse {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "Error de base de datos";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Subida idempotente por UUID: reintentar un lote ya subido no duplica. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  // created_by lo pone el servidor: el RLS exige que sea el usuario en sesión.
  const rows: Record<string, SqlValue>[] = parsed.data.events.map((event) => ({
    id: event.id,
    game_id: event.gameId,
    team_id: event.teamId,
    player_id: event.playerId,
    event_type: event.eventType,
    payload: event.payload,
    period: event.period,
    clock_seconds: event.clockSeconds,
    corrects_event_id: event.correctsEventId,
    created_by: user.id,
    created_at: event.createdAt,
  }));

  try {
    const db = await getDb();
    await db.exec(sql`
      insert into public.game_events ${insertRows(rows)}
      on conflict (id) do nothing
    `);
  } catch (error) {
    return failed(error);
  }
  return NextResponse.json({ ok: true, inserted: rows.length });
}

/** Relectura completa de los eventos del partido (puesta al día). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const gameId = request.nextUrl.searchParams.get("gameId");
  if (!gameId || !z.uuid().safeParse(gameId).success) {
    return NextResponse.json({ error: "Falta gameId" }, { status: 400 });
  }

  try {
    const db = await getDb();
    const events = await db.rows(sql`
      select id, seq, game_id, team_id, player_id, event_type, payload, period,
             clock_seconds, corrects_event_id, created_by, created_at
        from public.game_events
       where game_id = ${gameId}
       order by seq
    `);
    return NextResponse.json({ events });
  } catch (error) {
    return failed(error);
  }
}
