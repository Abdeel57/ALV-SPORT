import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { insertRows, sql, type SqlValue } from "@/lib/db";
import { getDb } from "@/lib/db/request";
import { POSITIONS, parseRulesProfile } from "@/lib/engine/scorebook";

/**
 * Arranque y cierre del partido desde la mesa. Ambas operaciones pasan por
 * el servidor con las MISMAS funciones de Postgres y el mismo RLS: el
 * anotador solo puede operar partidos asignados (o ser admin de la liga).
 */

export const dynamic = "force-dynamic";

const POSITION_CODES = POSITIONS.map((position) => position.code) as [string, ...string[]];

const slotSchema = z.object({
  playerId: z.uuid(),
  /** Puesto en el orden al bate (1..n). null solo para FLEX (no batea). */
  slot: z.number().int().min(1).max(20).nullable(),
  position: z.enum(POSITION_CODES).nullable(),
  role: z.enum(["starter", "EP", "DH", "FLEX"]),
});

const startSchema = z.object({
  action: z.literal("start"),
  gameId: z.uuid(),
  /** teamId → alineación inicial. */
  lineups: z.record(z.uuid(), z.array(slotSchema).max(30)),
});

const finalizeSchema = z.object({
  action: z.literal("finalize"),
  gameId: z.uuid(),
});

const bodySchema = z.discriminatedUnion("action", [startSchema, finalizeSchema]);

function failed(error: unknown, status = 400): NextResponse {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "Error de base de datos";
  return NextResponse.json({ error: message }, { status });
}

function validateLineup(
  slots: z.infer<typeof slotSchema>[],
  rules: ReturnType<typeof parseRulesProfile>["rules"],
): string | null {
  const batters = slots.filter((s) => s.slot !== null);
  const slotNumbers = batters.map((s) => s.slot);
  if (new Set(slotNumbers).size !== slotNumbers.length) return "Dos jugadores comparten el mismo turno al bate.";
  const players = slots.map((s) => s.playerId);
  if (new Set(players).size !== players.length) return "Un jugador aparece dos veces en la alineación.";
  const positions = slots.map((s) => s.position).filter((p): p is string => p !== null);
  if (new Set(positions).size !== positions.length) return "Dos jugadores ocupan la misma posición defensiva.";
  if (batters.length < rules.minBatters) return `La alineación necesita al menos ${rules.minBatters} bateadores.`;
  if (batters.length > rules.maxBatters) return `La alineación admite máximo ${rules.maxBatters} bateadores.`;
  if (positions.length > rules.fielders) return `Máximo ${rules.fielders} defensivos en esta modalidad.`;
  for (const slot of slots) {
    if (slot.role === "FLEX" && slot.slot !== null) return "Un FLEX no ocupa turno al bate.";
    if (slot.role !== "FLEX" && slot.slot === null) return "Todo bateador necesita turno al bate.";
    if ((slot.role === "EP" || slot.role === "DH") && slot.position !== null) {
      return "EP y DH batean sin posición defensiva; usa 'titular' si también defiende.";
    }
  }
  return null;
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

  // Reglas de la liga del partido (para validar la alineación en servidor).
  let rulesRaw: unknown = null;
  try {
    const row = await db.maybeOne<{ rules: unknown; home_team_id: string; away_team_id: string }>(sql`
      select l.rules, g.home_team_id, g.away_team_id
        from public.games g
        join public.seasons s on s.id = g.season_id
        join public.leagues l on l.id = s.league_id
       where g.id = ${body.gameId}
       limit 1
    `);
    if (!row) return NextResponse.json({ error: "El partido no existe o no tienes acceso" }, { status: 404 });
    rulesRaw = row.rules;
    for (const teamId of Object.keys(body.lineups)) {
      if (teamId !== row.home_team_id && teamId !== row.away_team_id) {
        return NextResponse.json({ error: "Equipo ajeno al partido" }, { status: 400 });
      }
    }
    if (!body.lineups[row.home_team_id]?.length || !body.lineups[row.away_team_id]?.length) {
      return NextResponse.json({ error: "Faltan alineaciones de un equipo" }, { status: 400 });
    }
  } catch (error) {
    return failed(error);
  }
  const { rules } = parseRulesProfile(rulesRaw);

  for (const [teamId, slots] of Object.entries(body.lineups)) {
    const problem = validateLineup(slots, rules);
    if (problem) return NextResponse.json({ error: problem, teamId }, { status: 400 });
  }

  const rows: Record<string, SqlValue>[] = Object.entries(body.lineups).flatMap(([teamId, slots]) =>
    slots.map((slot) => ({
      game_id: body.gameId,
      team_id: teamId,
      player_id: slot.playerId,
      is_starter: true,
      batting_order: slot.slot,
      position: slot.position,
      lineup_role: slot.role,
    })),
  );

  try {
    await db.tx(async (tx) => {
      // Reemplazo completo: un reintento con selección distinta no debe
      // dejar titulares fantasma de la confirmación anterior.
      await tx.exec(sql`delete from public.game_lineups where game_id = ${body.gameId}`);
      if (rows.length > 0) {
        await tx.exec(sql`insert into public.game_lineups ${insertRows(rows)}`);
      }
      // start_game es idempotente y toma la copia de reglas del partido.
      await tx.exec(sql`select public.start_game(${body.gameId})`);
    });
  } catch (error) {
    return failed(error);
  }
  return NextResponse.json({ ok: true });
}
