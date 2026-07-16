import type {
  ConnectionStatus,
  QueueAction,
  QueuedEvent,
  QueueState,
} from "./types";

/**
 * Reducer PURO de la cola offline (sin I/O, sin Date.now): la persistencia
 * en IndexedDB y la subida viven en idb.ts y sync.ts. Esto lo hace
 * unit-testeable igual que el motor.
 */

export const initialQueueState: QueueState = { events: [] };

function sortByLocalSeq(events: readonly QueuedEvent[]): QueuedEvent[] {
  return [...events].sort((a, b) => a.localSeq - b.localSeq);
}

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case "hydrate": {
      // MERGE, no reemplazo: un evento anotado antes de que termine la
      // hidratación de IndexedDB debe sobrevivir. Los persistidos van
      // primero (su localSeq manda); los que solo existen en memoria se
      // re-secuencian después, preservando su orden relativo.
      const persisted = sortByLocalSeq(action.events);
      const persistedIds = new Set(persisted.map((event) => event.id));
      const memoryOnly = state.events.filter(
        (event) => !persistedIds.has(event.id),
      );
      let nextSeq = persisted.reduce(
        (max, event) => Math.max(max, event.localSeq),
        0,
      );
      const reseeded = memoryOnly.map((event) => {
        nextSeq += 1;
        return { ...event, localSeq: nextSeq };
      });
      return { events: [...persisted, ...reseeded] };
    }

    case "enqueue": {
      // Idempotente: encolar dos veces el mismo UUID es un no-op.
      if (state.events.some((event) => event.id === action.event.id)) {
        return state;
      }
      const nextSeq =
        state.events.reduce((max, event) => Math.max(max, event.localSeq), 0) + 1;
      return {
        events: [
          ...state.events,
          {
            ...action.event,
            status: "pending",
            localSeq: nextSeq,
            attempts: 0,
            lastError: null,
          },
        ],
      };
    }

    case "mark_synced": {
      const ids = new Set(action.ids);
      return {
        events: state.events.map((event) =>
          ids.has(event.id)
            ? { ...event, status: "synced", lastError: null }
            : event,
        ),
      };
    }

    case "mark_failed": {
      const ids = new Set(action.ids);
      return {
        events: state.events.map((event) =>
          ids.has(event.id) && event.status === "pending"
            ? { ...event, attempts: event.attempts + 1, lastError: action.error }
            : event,
        ),
      };
    }

    case "prune_synced": {
      // Sin ids: poda todos los synced. Con ids: solo los synced confirmados
      // (p. ej. ya presentes en los eventos del servidor vía Realtime).
      const ids = action.ids ? new Set(action.ids) : null;
      return {
        events: state.events.filter(
          (event) =>
            event.status !== "synced" || (ids !== null && !ids.has(event.id)),
        ),
      };
    }
  }
}

/** Eventos por subir, en orden. El orden local ES el orden de subida. */
export function pendingEvents(state: QueueState): QueuedEvent[] {
  return state.events.filter((event) => event.status === "pending");
}

export function pendingCount(state: QueueState): number {
  return pendingEvents(state).length;
}

export function connectionStatus(
  state: QueueState,
  online: boolean,
): ConnectionStatus {
  if (!online) return "offline";
  return pendingCount(state) === 0 ? "synced" : "pending";
}
