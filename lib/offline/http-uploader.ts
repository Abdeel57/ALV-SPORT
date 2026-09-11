import type { QueuedEvent, Uploader } from "./index";

/**
 * Uploader real: manda el lote a /api/anotador/events, que inserta con
 * ON CONFLICT DO NOTHING. Reintentar un lote ya subido es un no-op en el
 * servidor, así que la cola jamás duplica eventos. El RLS sigue validando
 * que el usuario sea el anotador asignado y el partido esté en progreso.
 */
export function createHttpUploader(): Uploader {
  return async (events: readonly QueuedEvent[]) => {
    const response = await fetch("/api/anotador/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: events.map((event) => ({
          id: event.id,
          gameId: event.gameId,
          teamId: event.teamId,
          playerId: event.playerId,
          eventType: event.eventType,
          payload: event.payload,
          period: event.period,
          clockSeconds: event.clockSeconds,
          correctsEventId: event.correctsEventId,
          createdAt: event.createdAt,
        })),
      }),
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(detail?.error ?? `Error ${response.status}`);
    }
  };
}
