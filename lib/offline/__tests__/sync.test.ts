import { describe, expect, it } from "vitest";
import { initialQueueState, queueReducer } from "../queue";
import { createSyncEngine, type SyncStore } from "../sync";
import type { QueueAction, QueuedEvent, QueuedEventInput, QueueState } from "../types";

function makeInput(id: string): QueuedEventInput {
  return {
    id,
    gameId: "g1",
    teamId: "t1",
    playerId: "p1",
    eventType: "run",
    payload: {},
    period: 1,
    clockSeconds: null,
    correctsEventId: null,
    createdBy: "u1",
    createdAt: "2026-07-16T18:00:00.000Z",
  };
}

function makeStore(ids: string[]): SyncStore & { state: QueueState } {
  let state = ids.reduce(
    (acc, id) => queueReducer(acc, { type: "enqueue", event: makeInput(id) }),
    initialQueueState,
  );
  return {
    get state() {
      return state;
    },
    getState: () => state,
    dispatch(action: QueueAction) {
      state = queueReducer(state, action);
    },
  };
}

describe("createSyncEngine", () => {
  it("sube todo en orden y marca synced", async () => {
    const store = makeStore(["a", "b", "c"]);
    const uploaded: string[] = [];
    const engine = createSyncEngine({
      store,
      batchSize: 2,
      isOnline: () => true,
      upload: async (events) => {
        uploaded.push(...events.map((e) => e.id));
      },
    });
    const result = await engine.flush();
    expect(result).toEqual({ uploaded: 3, error: null });
    expect(uploaded).toEqual(["a", "b", "c"]); // orden preservado entre lotes
    expect(store.state.events.every((e) => e.status === "synced")).toBe(true);
  });

  it("una falla detiene el flush sin subir eventos posteriores fuera de orden", async () => {
    const store = makeStore(["a", "b", "c"]);
    let calls = 0;
    const engine = createSyncEngine({
      store,
      batchSize: 1,
      isOnline: () => true,
      upload: async (events) => {
        calls += 1;
        if (events[0]?.id === "b") throw new Error("red caída");
      },
    });
    const result = await engine.flush();
    expect(result.uploaded).toBe(1);
    expect(result.error).toBe("red caída");
    expect(calls).toBe(2); // a ok, b falla, c NO se intentó
    const byId = new Map(store.state.events.map((e) => [e.id, e]));
    expect(byId.get("a")?.status).toBe("synced");
    expect(byId.get("b")?.status).toBe("pending");
    expect(byId.get("b")?.attempts).toBe(1);
    expect(byId.get("c")?.status).toBe("pending");
    expect(byId.get("c")?.attempts).toBe(0);
  });

  it("reintentar tras una falla termina de subir sin duplicar", async () => {
    const store = makeStore(["a", "b"]);
    const uploaded: string[] = [];
    let failNext = true;
    const engine = createSyncEngine({
      store,
      batchSize: 25,
      isOnline: () => true,
      upload: async (events) => {
        if (failNext) {
          failNext = false;
          throw new Error("timeout");
        }
        uploaded.push(...events.map((e) => e.id));
      },
    });
    const first = await engine.flush();
    expect(first).toMatchObject({ uploaded: 0, error: "timeout" });
    const second = await engine.flush(); // reintento
    expect(second).toEqual({ uploaded: 2, error: null });
    expect(uploaded).toEqual(["a", "b"]); // exactamente una vez cada uno
  });

  it("single-flight: un flush concurrente no duplica subidas", async () => {
    const store = makeStore(["a", "b"]);
    const uploaded: string[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const engine = createSyncEngine({
      store,
      batchSize: 25,
      isOnline: () => true,
      upload: async (events) => {
        await gate; // simula red lenta
        uploaded.push(...events.map((e) => e.id));
      },
    });
    const first = engine.flush();
    const second = engine.flush(); // entra mientras el primero está en vuelo
    release?.();
    const [r1, r2] = await Promise.all([first, second]);
    expect(uploaded).toEqual(["a", "b"]); // una sola vez
    expect(r1.uploaded + r2.uploaded).toBe(2);
  });

  it("sin conexión no intenta subir nada", async () => {
    const store = makeStore(["a"]);
    let calls = 0;
    const engine = createSyncEngine({
      store,
      isOnline: () => false,
      upload: async () => {
        calls += 1;
      },
    });
    const result = await engine.flush();
    expect(result).toEqual({ uploaded: 0, error: null });
    expect(calls).toBe(0);
    expect(store.state.events[0]?.status).toBe("pending");
  });

  it("eventos duplicados del servidor no rompen el flush (uploader idempotente)", async () => {
    // Simula el comportamiento real del upsert ignoreDuplicates: subir un
    // evento que el servidor ya tiene NO es error.
    const server = new Set<string>(["a"]); // "a" ya llegó en un intento previo
    const store = makeStore(["a", "b"]);
    const engine = createSyncEngine({
      store,
      isOnline: () => true,
      upload: async (events: readonly QueuedEvent[]) => {
        for (const event of events) server.add(event.id); // upsert: no truena
      },
    });
    const result = await engine.flush();
    expect(result).toEqual({ uploaded: 2, error: null });
    expect([...server].sort()).toEqual(["a", "b"]); // sin duplicados
  });
});
