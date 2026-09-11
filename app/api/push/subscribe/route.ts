import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getServiceDb } from "@/lib/push/send";

/**
 * Gestión de suscripciones push. El navegador manda su PushSubscription y
 * el equipo a seguir; el servidor la guarda omitiendo RLS (los visitantes
 * anónimos también pueden seguir equipos).
 */

const subscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

const postSchema = z.object({
  subscription: subscriptionSchema,
  teamId: z.uuid(),
  userId: z.uuid().nullable().optional(),
});

const putSchema = z.object({
  endpoint: z.url(),
  notifyStart: z.boolean(),
  notifyPeriod: z.boolean(),
  notifyFinal: z.boolean(),
});

const deleteSchema = z.object({
  endpoint: z.url(),
  teamId: z.uuid().optional(),
});

function unavailable(): NextResponse {
  return NextResponse.json(
    { error: "Notificaciones no configuradas" },
    { status: 503 },
  );
}

function failed(error: unknown): NextResponse {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "Error de base de datos";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = getServiceDb();
  if (!db) return unavailable();
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { subscription, teamId, userId } = parsed.data;

  try {
    // Alta o actualización en una sola sentencia: el endpoint es único, y
    // al reencontrarlo se agrega el equipo a los que ya sigue.
    await db.exec(sql`
      insert into public.push_subscriptions
        (endpoint, p256dh, auth, user_id, followed_team_ids)
      values (${subscription.endpoint}, ${subscription.keys.p256dh},
              ${subscription.keys.auth}, ${userId ?? null},
              array[${teamId}]::uuid[])
      on conflict (endpoint) do update
        set p256dh = excluded.p256dh,
            auth = excluded.auth,
            followed_team_ids = (
              select array(
                select distinct unnest(
                  public.push_subscriptions.followed_team_ids || excluded.followed_team_ids
                )
              )
            )
    `);
  } catch (error) {
    return failed(error);
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const db = getServiceDb();
  if (!db) return unavailable();
  const endpoint = request.nextUrl.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "Falta endpoint" }, { status: 400 });

  const row = await db.maybeOne<{
    followed_team_ids: string[];
    notify_start: boolean;
    notify_period: boolean;
    notify_final: boolean;
  }>(sql`
    select followed_team_ids, notify_start, notify_period, notify_final
      from public.push_subscriptions
     where endpoint = ${endpoint}
     limit 1
  `);
  if (!row) return NextResponse.json({ found: false });
  return NextResponse.json({
    found: true,
    teams: row.followed_team_ids,
    notifyStart: row.notify_start,
    notifyPeriod: row.notify_period,
    notifyFinal: row.notify_final,
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const db = getServiceDb();
  if (!db) return unavailable();
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { endpoint, notifyStart, notifyPeriod, notifyFinal } = parsed.data;

  try {
    await db.exec(sql`
      update public.push_subscriptions
         set notify_start = ${notifyStart},
             notify_period = ${notifyPeriod},
             notify_final = ${notifyFinal}
       where endpoint = ${endpoint}
    `);
  } catch (error) {
    return failed(error);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const db = getServiceDb();
  if (!db) return unavailable();
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { endpoint, teamId } = parsed.data;

  try {
    if (!teamId) {
      await db.exec(sql`
        delete from public.push_subscriptions where endpoint = ${endpoint}
      `);
      return NextResponse.json({ ok: true });
    }

    // Deja de seguir a un equipo; si era el último, se borra la suscripción.
    await db.tx(async (tx) => {
      await tx.exec(sql`
        update public.push_subscriptions
           set followed_team_ids = array_remove(followed_team_ids, ${teamId}::uuid)
         where endpoint = ${endpoint}
      `);
      await tx.exec(sql`
        delete from public.push_subscriptions
         where endpoint = ${endpoint}
           and cardinality(followed_team_ids) = 0
      `);
    });
  } catch (error) {
    return failed(error);
  }
  return NextResponse.json({ ok: true });
}
