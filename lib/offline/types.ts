/**
 * Cola offline de la mesa de anotación. Los eventos se escriben PRIMERO
 * aquí (IndexedDB) con UUID generado en cliente, y el sync engine los sube
 * en orden cuando hay conexión. Idempotencia por UUID: el upsert del
 * servidor ignora duplicados, así que reintentar jamás duplica.
 */

export type QueuedEventStatus = "pending" | "synced";

/** Lo que la UI encola: espejo de la fila de game_events (camelCase). */
export interface QueuedEventInput {
  /** UUID generado en cliente — clave de idempotencia. */
  id: string;
  gameId: string;
  teamId: string | null;
  playerId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  period: number | null;
  clockSeconds: number | null;
  correctsEventId: string | null;
  createdBy: string;
  /** ISO; se fija al encolar (no al sincronizar). */
  createdAt: string;
}

export interface QueuedEvent extends QueuedEventInput {
  status: QueuedEventStatus;
  /** Orden local monótono por juego: el orden de subida. */
  localSeq: number;
  /** Intentos de subida fallidos. */
  attempts: number;
  lastError: string | null;
}

export interface QueueState {
  /** Siempre ordenados por localSeq ascendente. */
  events: QueuedEvent[];
}

export type QueueAction =
  | { type: "hydrate"; events: readonly QueuedEvent[] }
  | { type: "enqueue"; event: QueuedEventInput }
  | { type: "mark_synced"; ids: readonly string[] }
  | { type: "mark_failed"; ids: readonly string[]; error: string }
  | { type: "prune_synced" };

export type ConnectionStatus = "synced" | "pending" | "offline";
