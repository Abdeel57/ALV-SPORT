import { NextResponse, type NextRequest } from "next/server";
import { runAiJob } from "@/lib/ai/job";
import { buildFinalPayload, buildGameStartPayload } from "@/lib/push/payloads";
import { claimPushSlot, getServiceClient, sendPushToFollowers } from "@/lib/push/send";

/**
 * Database Webhook de Supabase: UPDATE en games. Dispara:
 *  - inicio de partido → notificación a seguidores;
 *  - final → notificación con marcador + job de IA (borrador de noticia
 *    en <60s; si la API falla, el partido ya cerró normal y el job
 *    reintenta hasta 3 veces).
 */

export const maxDuration = 60;

interface GameRecord {
  id: string;
  status: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
}

interface WebhookBody {
  type?: string;
  record?: GameRecord;
  old_record?: { status?: string };
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
  const oldStatus = body?.old_record?.status;
  if (body?.type !== "UPDATE" || !record || record.status === oldStatus) {
    return NextResponse.json({ ok: true });
  }

  const { data: teamRows } = await supabase
    .from("teams")
    .select("id, name")
    .in("id", [record.home_team_id, record.away_team_id]);
  const names = new Map(
    ((teamRows ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
  );
  const gameForPush = {
    id: record.id,
    homeTeamId: record.home_team_id,
    awayTeamId: record.away_team_id,
    homeName: names.get(record.home_team_id) ?? "Local",
    awayName: names.get(record.away_team_id) ?? "Visitante",
  };
  const teams = [record.home_team_id, record.away_team_id];

  if (record.status === "in_progress" && oldStatus === "scheduled") {
    if (await claimPushSlot(supabase, record.id, "start", null)) {
      await sendPushToFollowers(teams, buildGameStartPayload(gameForPush));
    }
    return NextResponse.json({ ok: true });
  }

  if (record.status === "finalized" && oldStatus !== "finalized") {
    if (await claimPushSlot(supabase, record.id, "final", null)) {
      await sendPushToFollowers(
        teams,
        buildFinalPayload(gameForPush, record.home_score ?? 0, record.away_score ?? 0),
      );
    }
    // Borrador de noticia con IA: si falla, el job queda en cola con
    // reintentos y el botón Regenerar del admin.
    const ai = await runAiJob(record.id);
    return NextResponse.json({ ok: true, ai });
  }

  return NextResponse.json({ ok: true });
}
