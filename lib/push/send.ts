import "server-only";
import webpush from "web-push";
import { ident, sql, type Db } from "@/lib/db";
import { hasDatabaseEnv } from "@/lib/db/pool";
import { serviceDb } from "@/lib/db/session";
import type { PushPayload } from "./payloads";

/**
 * Envío de Web Push desde el servidor (VAPID). Maneja suscripciones
 * expiradas: 404/410 elimina la fila. Nunca se envía desde el cliente.
 */

export function hasPushEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}

/**
 * Ejecutor privilegiado para tareas sin usuario (webhooks internos). Omite
 * RLS igual que la antigua service-role key.
 */
export function getServiceDb(): Db | null {
  return hasDatabaseEnv() ? serviceDb() : null;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const prefColumn: Record<PushPayload["kind"], string> = {
  start: "notify_start",
  period: "notify_period",
  final: "notify_final",
};

/**
 * Envía el payload a todos los seguidores de los equipos dados que tengan
 * activado ese tipo de notificación. Devuelve cuántas se enviaron.
 */
export async function sendPushToFollowers(
  teamIds: readonly string[],
  payload: PushPayload,
): Promise<number> {
  if (!hasPushEnv()) return 0;
  const db = getServiceDb();
  if (!db) return 0;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@alvsport.mx",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    process.env.VAPID_PRIVATE_KEY ?? "",
  );

  // `&&` es el operador de solapamiento de arreglos en Postgres: equivale al
  // .overlaps() que usaba PostgREST.
  const rows = await db.rows<SubscriptionRow>(sql`
    select id, endpoint, p256dh, auth
      from public.push_subscriptions
     where followed_team_ids && ${[...teamIds]}::uuid[]
       and ${ident(prefColumn[payload.kind])}
  `);

  let sent = 0;
  const expired: string[] = [];
  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 },
        );
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          expired.push(row.id);
        }
        // Otros errores: se ignoran (mejor perder una notificación que
        // tumbar el webhook; el siguiente evento reintenta de facto).
      }
    }),
  );

  if (expired.length > 0) {
    await db.exec(sql`
      delete from public.push_subscriptions where id = any(${expired}::uuid[])
    `);
  }
  return sent;
}

/**
 * Idempotencia: registra (game, kind, period) y devuelve true solo la
 * primera vez. Un webhook interno puede re-entregarse.
 */
export async function claimPushSlot(
  db: Db,
  gameId: string,
  kind: PushPayload["kind"],
  period: number | null,
): Promise<boolean> {
  try {
    await db.exec(sql`
      insert into public.push_log (game_id, kind, period)
      values (${gameId}, ${kind}, ${period})
    `);
    return true;
  } catch {
    // Violación de unicidad = ya se envió antes.
    return false;
  }
}
