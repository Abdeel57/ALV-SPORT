import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/push/send";

/**
 * Gestión de suscripciones push. El navegador manda su PushSubscription y
 * el equipo a seguir; el servidor la guarda con service role (los
 * visitantes anónimos también pueden seguir equipos).
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = getServiceClient();
  if (!supabase) return unavailable();
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { subscription, teamId, userId } = parsed.data;

  const { data: existing } = await supabase
    .from("push_subscriptions")
    .select("id, followed_team_ids")
    .eq("endpoint", subscription.endpoint)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; followed_team_ids: string[] };
    const teams = [...new Set([...row.followed_team_ids, teamId])];
    const { error } = await supabase
      .from("push_subscriptions")
      .update({
        followed_team_ids: teams,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      })
      .eq("id", row.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase.from("push_subscriptions").insert({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_id: userId ?? null,
      followed_team_ids: [teamId],
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = getServiceClient();
  if (!supabase) return unavailable();
  const endpoint = request.nextUrl.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "Falta endpoint" }, { status: 400 });
  const { data } = await supabase
    .from("push_subscriptions")
    .select("followed_team_ids, notify_start, notify_period, notify_final")
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (!data) return NextResponse.json({ found: false });
  const row = data as {
    followed_team_ids: string[];
    notify_start: boolean;
    notify_period: boolean;
    notify_final: boolean;
  };
  return NextResponse.json({
    found: true,
    teams: row.followed_team_ids,
    notifyStart: row.notify_start,
    notifyPeriod: row.notify_period,
    notifyFinal: row.notify_final,
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const supabase = getServiceClient();
  if (!supabase) return unavailable();
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { endpoint, notifyStart, notifyPeriod, notifyFinal } = parsed.data;
  const { error } = await supabase
    .from("push_subscriptions")
    .update({
      notify_start: notifyStart,
      notify_period: notifyPeriod,
      notify_final: notifyFinal,
    })
    .eq("endpoint", endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const supabase = getServiceClient();
  if (!supabase) return unavailable();
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { endpoint, teamId } = parsed.data;

  if (!teamId) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return NextResponse.json({ ok: true });
  }
  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, followed_team_ids")
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (data) {
    const row = data as { id: string; followed_team_ids: string[] };
    const teams = row.followed_team_ids.filter((id) => id !== teamId);
    if (teams.length === 0) {
      await supabase.from("push_subscriptions").delete().eq("id", row.id);
    } else {
      await supabase
        .from("push_subscriptions")
        .update({ followed_team_ids: teams })
        .eq("id", row.id);
    }
  }
  return NextResponse.json({ ok: true });
}
