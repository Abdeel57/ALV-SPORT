import { initialQueueState, queueReducer } from "./queue";
import type { QueueAction, QueueState } from "./types";

/**
 * Store síncrono de la cola, FUERA del ciclo de render de React. El sync
 * engine exige que getState() refleje cada dispatch inmediatamente (el
 * dispatch de useReducer es asíncrono y provocaría lotes re-subidos y
 * lecturas obsoletas). React se suscribe vía useSyncExternalStore.
 */
export interface QueueStore {
  getState(): QueueState;
  dispatch(action: QueueAction): void;
  subscribe(listener: () => void): () => void;
}

export function createQueueStore(
  initial: QueueState = initialQueueState,
): QueueStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch(action) {
      const next = queueReducer(state, action);
      if (next === state) return;
      state = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
