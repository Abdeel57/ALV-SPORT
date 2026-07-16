import { pendingEvents } from "./queue";
import type { QueueAction, QueuedEvent, QueueState } from "./types";

/**
 * Motor de sincronización: sube los eventos pendientes EN ORDEN, por lotes.
 * El uploader se inyecta (Supabase en producción, fake en pruebas). Un lote
 * que falla detiene el flush — jamás se sube un evento posterior antes que
 * uno anterior. Reintentar es simplemente volver a llamar flush(): la
 * idempotencia por UUID hace que los reintentos nunca dupliquen.
 */

export interface SyncStore {
  getState(): QueueState;
  dispatch(action: QueueAction): void;
}

export type Uploader = (events: readonly QueuedEvent[]) => Promise<void>;

export interface SyncEngineOptions {
  store: SyncStore;
  upload: Uploader;
  batchSize?: number;
  /** Inyectable para pruebas; default navigator.onLine (true en SSR). */
  isOnline?: () => boolean;
}

export interface FlushResult {
  uploaded: number;
  error: string | null;
}

export interface SyncEngine {
  flush(): Promise<FlushResult>;
  readonly isFlushing: boolean;
}

function defaultIsOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const { store, upload, batchSize = 25, isOnline = defaultIsOnline } = options;
  let inFlight: Promise<FlushResult> | null = null;

  async function doFlush(): Promise<FlushResult> {
    let uploaded = 0;
    for (;;) {
      const batch = pendingEvents(store.getState()).slice(0, batchSize);
      if (batch.length === 0) return { uploaded, error: null };
      try {
        await upload(batch);
        store.dispatch({ type: "mark_synced", ids: batch.map((e) => e.id) });
        uploaded += batch.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        store.dispatch({
          type: "mark_failed",
          ids: batch.map((e) => e.id),
          error: message,
        });
        return { uploaded, error: message };
      }
    }
  }

  function flush(): Promise<FlushResult> {
    // Single-flight ENCADENADO: un flush concurrente espera y comparte el
    // resultado del que ya está en vuelo (jamás un no-op silencioso — un
    // llamador como "finalizar partido" necesita esperar la subida real).
    if (inFlight) return inFlight;
    if (!isOnline()) return Promise.resolve({ uploaded: 0, error: null });

    const run = doFlush();
    inFlight = run;
    void run.finally(() => {
      inFlight = null;
    });
    return run;
  }

  return {
    flush,
    get isFlushing() {
      return inFlight !== null;
    },
  };
}
