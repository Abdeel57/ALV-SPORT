import { describe, expect, it } from "vitest";
import {
  connectionStatus,
  initialQueueState,
  pendingCount,
  pendingEvents,
  queueReducer,
} from "../queue";
import type { QueuedEvent, QueuedEventInput, QueueState } from "../types";

function makeInput(id: string, overrides: Partial<QueuedEventInput> = {}): QueuedEventInput {
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
    ...overrides,
  };
}

function enqueue(state: QueueState, ...ids: string[]): QueueState {
  return ids.reduce(
    (acc, id) => queueReducer(acc, { type: "enqueue", event: makeInput(id) }),
    state,
  );
}

describe("queueReducer — encolar", () => {
  it("asigna localSeq monótono en orden de llegada", () => {
    const state = enqueue(initialQueueState, "a", "b", "c");
    expect(state.events.map((e) => [e.id, e.localSeq])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    expect(state.events.every((e) => e.status === "pending")).toBe(true);
  });

  it("es idempotente: encolar el mismo UUID dos veces no duplica", () => {
    const once = enqueue(initialQueueState, "a", "b");
    const twice = queueReducer(once, { type: "enqueue", event: makeInput("a") });
    expect(twice).toBe(once);
    expect(twice.events).toHaveLength(2);
  });

  it("el localSeq no se reutiliza aunque se poden eventos synced", () => {
    let state = enqueue(initialQueueState, "a", "b");
    state = queueReducer(state, { type: "mark_synced", ids: ["a", "b"] });
    state = queueReducer(state, { type: "prune_synced" });
    state = enqueue(state, "c");
    // "c" continúa después de los podados: el orden global se preserva.
    expect(state.events).toHaveLength(1);
    expect(state.events[0]?.localSeq).toBe(1);
  });
});

describe("queueReducer — sincronización y reintentos", () => {
  it("mark_synced saca los eventos de pendientes y limpia el error", () => {
    let state = enqueue(initialQueueState, "a", "b", "c");
    state = queueReducer(state, { type: "mark_failed", ids: ["a"], error: "red caída" });
    state = queueReducer(state, { type: "mark_synced", ids: ["a", "b"] });
    expect(pendingEvents(state).map((e) => e.id)).toEqual(["c"]);
    expect(state.events.find((e) => e.id === "a")?.lastError).toBeNull();
  });

  it("mark_failed incrementa intentos y conserva el evento como pendiente", () => {
    let state = enqueue(initialQueueState, "a");
    state = queueReducer(state, { type: "mark_failed", ids: ["a"], error: "timeout" });
    state = queueReducer(state, { type: "mark_failed", ids: ["a"], error: "timeout" });
    const event = state.events[0];
    expect(event?.status).toBe("pending"); // sigue en la cola: se reintentará
    expect(event?.attempts).toBe(2);
    expect(event?.lastError).toBe("timeout");
    expect(pendingCount(state)).toBe(1);
  });

  it("mark_failed sobre un evento ya synced es un no-op", () => {
    let state = enqueue(initialQueueState, "a");
    state = queueReducer(state, { type: "mark_synced", ids: ["a"] });
    const after = queueReducer(state, { type: "mark_failed", ids: ["a"], error: "x" });
    expect(after.events[0]?.status).toBe("synced");
    expect(after.events[0]?.attempts).toBe(0);
  });

  it("hydrate restaura la cola ordenada por localSeq (recuperación al reabrir)", () => {
    const persisted: QueuedEvent[] = [
      { ...makeInput("b"), status: "pending", localSeq: 2, attempts: 0, lastError: null },
      { ...makeInput("a"), status: "synced", localSeq: 1, attempts: 1, lastError: null },
    ];
    const state = queueReducer(initialQueueState, { type: "hydrate", events: persisted });
    expect(state.events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(pendingEvents(state).map((e) => e.id)).toEqual(["b"]);
  });

  it("hydrate FUSIONA: un evento anotado antes de terminar la hidratación sobrevive", () => {
    // El anotador toca una acción mientras loadQueuedEvents sigue en vuelo.
    const tapped = enqueue(initialQueueState, "nuevo"); // localSeq 1 en memoria
    const persisted: QueuedEvent[] = [
      { ...makeInput("a"), status: "synced", localSeq: 1, attempts: 0, lastError: null },
      { ...makeInput("b"), status: "pending", localSeq: 2, attempts: 0, lastError: null },
    ];
    const state = queueReducer(tapped, { type: "hydrate", events: persisted });
    // Persistidos primero; el evento en memoria se re-secuencia al final.
    expect(state.events.map((e) => [e.id, e.localSeq])).toEqual([
      ["a", 1],
      ["b", 2],
      ["nuevo", 3],
    ]);
    expect(pendingEvents(state).map((e) => e.id)).toEqual(["b", "nuevo"]);
  });

  it("hydrate no duplica cuando el mismo id existe en memoria y persistido", () => {
    const tapped = enqueue(initialQueueState, "a");
    const persisted: QueuedEvent[] = [
      { ...makeInput("a"), status: "synced", localSeq: 5, attempts: 1, lastError: null },
    ];
    const state = queueReducer(tapped, { type: "hydrate", events: persisted });
    expect(state.events).toHaveLength(1);
    expect(state.events[0]?.status).toBe("synced"); // gana la versión persistida
  });

  it("prune_synced con ids poda solo los confirmados", () => {
    let state = enqueue(initialQueueState, "a", "b", "c");
    state = queueReducer(state, { type: "mark_synced", ids: ["a", "b"] });
    state = queueReducer(state, { type: "prune_synced", ids: ["a"] });
    // "b" sigue synced (sin confirmar por el servidor); "c" sigue pending.
    expect(state.events.map((e) => e.id)).toEqual(["b", "c"]);
    state = queueReducer(state, { type: "prune_synced" });
    expect(state.events.map((e) => e.id)).toEqual(["c"]);
  });
});

describe("connectionStatus", () => {
  it("refleja Sincronizado / N pendientes / Sin conexión", () => {
    const empty = initialQueueState;
    const withPending = enqueue(empty, "a");
    expect(connectionStatus(empty, true)).toBe("synced");
    expect(connectionStatus(withPending, true)).toBe("pending");
    expect(connectionStatus(withPending, false)).toBe("offline");
    expect(connectionStatus(empty, false)).toBe("offline");
  });
});
