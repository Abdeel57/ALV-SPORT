import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueuedEvent, Uploader } from "./index";

/**
 * Uploader real: upsert por UUID con ignoreDuplicates. Reintentar un lote
 * ya subido es un no-op en el servidor (ON CONFLICT DO NOTHING), así que
 * la cola jamás duplica eventos. RLS valida que el usuario sea el anotador
 * asignado y que el partido esté en progreso.
 */
export function createSupabaseUploader(supabase: SupabaseClient): Uploader {
  return async (events: readonly QueuedEvent[]) => {
    const rows = events.map((event) => ({
      id: event.id,
      game_id: event.gameId,
      team_id: event.teamId,
      player_id: event.playerId,
      event_type: event.eventType,
      payload: event.payload,
      period: event.period,
      clock_seconds: event.clockSeconds,
      corrects_event_id: event.correctsEventId,
      created_by: event.createdBy,
      created_at: event.createdAt,
    }));
    const { error } = await supabase
      .from("game_events")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  };
}
