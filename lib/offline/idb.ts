import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { QueuedEvent } from "./types";

/**
 * Persistencia local de la mesa de anotación. Si la app se cierra a media
 * anotación, al reabrir se recupera la cola de eventos y el punto exacto
 * del partido (fase, entrada, alineaciones) desde aquí.
 */

export interface GameMeta {
  gameId: string;
  phase: "lineups" | "scoring" | "finished";
  /** Entrada/cuarto actual (base 1). */
  period: number;
  /** Solo softbol/béisbol: alta (visita batea) o baja (local batea). */
  half: "top" | "bottom" | null;
  /** Por teamId: ids de jugadores titulares en orden al bat. */
  lineups: Record<string, string[]>;
  /** Equipo activo en el riel (clave para deportes sin innings). */
  activeTeamId?: string | null;
  updatedAt: string;
}

interface AnotadorDB extends DBSchema {
  events: {
    key: string;
    value: QueuedEvent;
    indexes: { "by-game": string };
  };
  meta: {
    key: string;
    value: GameMeta;
  };
}

const DB_NAME = "alv-anotador";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<AnotadorDB>> | null = null;

function getDb(): Promise<IDBPDatabase<AnotadorDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no disponible (SSR)"));
  }
  dbPromise ??= openDB<AnotadorDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const events = db.createObjectStore("events", { keyPath: "id" });
      events.createIndex("by-game", "gameId");
      db.createObjectStore("meta", { keyPath: "gameId" });
    },
  });
  return dbPromise;
}

export async function loadQueuedEvents(gameId: string): Promise<QueuedEvent[]> {
  const db = await getDb();
  const events = await db.getAllFromIndex("events", "by-game", gameId);
  return events.sort((a, b) => a.localSeq - b.localSeq);
}

/** Upsert de toda la cola del juego (N pequeño: un partido). */
export async function persistQueuedEvents(
  events: readonly QueuedEvent[],
): Promise<void> {
  if (events.length === 0) return;
  const db = await getDb();
  const tx = db.transaction("events", "readwrite");
  await Promise.all(events.map((event) => tx.store.put(event)));
  await tx.done;
}

export async function deleteQueuedEvents(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const tx = db.transaction("events", "readwrite");
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function loadGameMeta(gameId: string): Promise<GameMeta | undefined> {
  const db = await getDb();
  return db.get("meta", gameId);
}

export async function persistGameMeta(meta: GameMeta): Promise<void> {
  const db = await getDb();
  await db.put("meta", meta);
}
