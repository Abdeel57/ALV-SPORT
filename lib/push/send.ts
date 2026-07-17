import "server-only";
import webpush from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

export function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  notify_start: boolean;
  notify_period: boolean;
  notify_final: boolean;
}

const prefColumn: Record<PushPayload["kind"], keyof SubscriptionRow> = {
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
  const supabase = getServiceClient();
  if (!supabase) return 0;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@alvsport.mx",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    process.env.VAPID_PRIVATE_KEY ?? "",
  );

  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, notify_start, notify_period, notify_final")
    .overlaps("followed_team_ids", [...teamIds])
    .eq(prefColumn[payload.kind], true);
  const rows = (data ?? []) as SubscriptionRow[];

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
    await supabase.from("push_subscriptions").delete().in("id", expired);
  }
  return sent;
}

/**
 * Idempotencia: registra (game, kind, period) y devuelve true solo la
 * primera vez. Los webhooks de Supabase pueden re-entregarse.
 */
export async function claimPushSlot(
  supabase: SupabaseClient,
  gameId: string,
  kind: PushPayload["kind"],
  period: number | null,
): Promise<boolean> {
  const { error } = await supabase.from("push_log").insert({
    game_id: gameId,
    kind,
    period,
  });
  // Violación de unicidad = ya se envió antes.
  return !error;
}
