import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { insertRows, sql, type SqlValue } from "@/lib/db";
import { getDb } from "@/lib/db/request";

/**
 * Arranque y cierre del partido desde la mesa. Ambas operaciones existían
 * como llamadas directas del navegador a PostgREST; ahora pasan por el
 * servidor, con las MISMAS funciones de Postgres y el mismo RLS.
 */

export const dynamic = "force-dynamic";

const startSchema = z.object({
  action: z.literal("start"),
  gameId: z.uuid(),
  /** teamId → alineación titular en orden. */
  lineups: z.record(z.uuid(), z.array(z.uuid()).max(60)),
  /** true en deportes por entradas: numera el orden al bat. */
  battingOrder: z.boolean(),
});

const finalizeSchema = z.object({
  action: z.literal("finalize"),
  gameId: z.uuid(),
});

const bodySchema = z.discriminatedUnion("action", [startSchema, finalizeSchema]);

function failed(error: unknown): NextResponse {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "Error de base de datos";
  return NextResponse.json({ error: message }, { status: 400 });
}

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
  const body = parsed.data;
  const db = await getDb();

  if (body.action === "finalize") {
    try {
      await db.exec(sql`select public.finalize_game(${body.gameId})`);
    } catch (error) {
      return failed(error);
    }
    return NextResponse.json({ ok: true });
  }

  const rows: Record<string, SqlValue>[] = Object.entries(body.lineups).flatMap(
    ([teamId, playerIds]) =>
      playerIds.map((playerId, index) => ({
        game_id: body.gameId,
        team_id: teamId,
        player_id: playerId,
        is_starter: true,
        batting_order: body.battingOrder ? index + 1 : null,
      })),
  );

  try {
    await db.tx(async (tx) => {
      // Reemplazo completo: un reintento con selección distinta no debe
      // dejar titulares fantasma de la confirmación anterior.
      await tx.exec(sql`
        delete from public.game_lineups where game_id = ${body.gameId}
      `);
      if (rows.length > 0) {
        await tx.exec(sql`insert into public.game_lineups ${insertRows(rows)}`);
      }
      // start_game es idempotente: reintentar no truena si ya inició.
      await tx.exec(sql`select public.start_game(${body.gameId})`);
    });
  } catch (error) {
    return failed(error);
  }
  return NextResponse.json({ ok: true });
}
