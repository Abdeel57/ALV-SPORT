import { describe, expect, it } from "vitest";
import { createQueueStore } from "../store";
import type { QueuedEventInput } from "../types";

function makeInput(id: string): QueuedEventInput {
  return {
    id,
    gameId: "g1",
    teamId: null,
    playerId: null,
    eventType: "run",
    payload: {},
    period: 1,
    clockSeconds: null,
    correctsEventId: null,
    createdBy: "u1",
    createdAt: "2026-07-16T18:00:00.000Z",
  };
}

describe("createQueueStore", () => {
  it("getState refleja cada dispatch de forma SÍNCRONA (contrato del sync engine)", () => {
    const store = createQueueStore();
    store.dispatch({ type: "enqueue", event: makeInput("a") });
    expect(store.getState().events).toHaveLength(1);
    store.dispatch({ type: "mark_synced", ids: ["a"] });
    expect(store.getState().events[0]?.status).toBe("synced");
  });

  it("notifica a los suscriptores en cada cambio y respeta el unsubscribe", () => {
    const store = createQueueStore();
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });
    store.dispatch({ type: "enqueue", event: makeInput("a") });
    expect(notified).toBe(1);
    // Acción no-op (id duplicado): mismo estado, sin notificación.
    store.dispatch({ type: "enqueue", event: makeInput("a") });
    expect(notified).toBe(1);
    unsubscribe();
    store.dispatch({ type: "enqueue", event: makeInput("b") });
    expect(notified).toBe(1);
  });
});
