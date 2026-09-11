import { type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getDb } from "@/lib/db/request";
import { getLiveBroker, type LiveUpdate } from "@/lib/live/broker";

/**
 * Marcador en vivo por SSE (Server-Sent Events).
 *
 * Es el reemplazo del websocket de Supabase Realtime: el navegador abre un
 * `EventSource` y el servidor le empuja los eventos nuevos del partido.
 * Una sola conexión a Postgres escucha por todos (ver lib/live/broker).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Sin buffering: el stream debe salir tal cual se escribe.
export const fetchCache = "force-no-store";

const HEARTBEAT_MS = 25_000;

interface RouteContext {
  params: Promise<{ gameId: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { gameId } = await context.params;
  const fromSeq = Number(request.nextUrl.searchParams.get("fromSeq") ?? "0");

  // Autorización: se consulta CON LA IDENTIDAD de quien mira. Si el RLS no
  // le deja ver el partido, no hay suscripción.
  const db = await getDb();
  let visible = false;
  try {
    visible = Boolean(
      await db.maybeOne<{ id: string }>(sql`
        select id from public.games where id = ${gameId} limit 1
      `),
    );
  } catch {
    return new Response("No disponible", { status: 503 });
  }
  if (!visible) return new Response("No encontrado", { status: 404 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;

      const write = (chunk: string): void => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          open = false;
        }
      };

      const close = (): void => {
        if (!open) return;
        open = false;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // Ya cerrado por el cliente.
        }
      };

      // `retry` le dice al navegador cada cuánto reintentar si se cae.
      write("retry: 3000\n\n");
      write(": conectado\n\n");

      unsubscribe = getLiveBroker().subscribe(
        gameId,
        Number.isFinite(fromSeq) && fromSeq > 0 ? fromSeq : 0,
        (update: LiveUpdate) => {
          write(`event: update\ndata: ${JSON.stringify(update)}\n\n`);
        },
      );

      // Latido: mantiene viva la conexión a través de proxies.
      heartbeat = setInterval(() => write(": latido\n\n"), HEARTBEAT_MS);

      request.signal.addEventListener("abort", close);
      if (request.signal.aborted) close();
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Desactiva el buffering de proxies tipo nginx.
      "X-Accel-Buffering": "no",
    },
  });
}
