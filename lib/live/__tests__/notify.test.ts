import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "@/lib/db/__tests__/support/pg-harness";
import { sql } from "@/lib/db/sql";
import { serviceDb } from "@/lib/db/session";

/**
 * La mitad de base de datos del marcador en vivo: los triggers que avisan
 * por `pg_notify`. Es lo que sustituye al servicio Realtime — si dejaran de
 * dispararse, el marcador se quedaría congelado hasta recargar la página.
 */

let harness: Harness;
let gameId = "";
let teamId = "";
let userId = "";

/** Espera el próximo aviso del canal, o falla por tiempo. */
function nextNotification(
  received: string[],
  timeoutMs = 5000,
): Promise<string> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const payload = received.shift();
      if (payload) return resolve(payload);
      if (Date.now() - started > timeoutMs) {
        return reject(new Error("No llegó ningún aviso de pg_notify"));
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://pruebas/en-proceso";
  harness = await startHarness();

  const db = serviceDb();
  const user = await db.one<{ id: string }>(sql`
    insert into auth.users (email, aud, role)
    values ('anotador-live@pruebas.test', 'authenticated', 'authenticated')
    returning id
  `);
  userId = user.id;

  const game = await db.one<{ id: string; home_team_id: string }>(sql`
    select id, home_team_id from public.games where status = 'scheduled' limit 1
  `);
  gameId = game.id;
  teamId = game.home_team_id;
  // El partido debe estar en curso para aceptar eventos.
  await db.exec(sql`
    update public.games set status = 'in_progress' where id = ${gameId}
  `);
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

describe("avisos del marcador en vivo", () => {
  it("avisa al insertar un evento, con el id del partido", async () => {
    const received: string[] = [];
    await harness.db.listen("alv_live", (payload) => {
      received.push(payload);
    });

    await serviceDb().exec(sql`
      insert into public.game_events (game_id, team_id, event_type, period, created_by)
      values (${gameId}, ${teamId}, 'run', 1, ${userId})
    `);

    const payload = JSON.parse(await nextNotification(received)) as {
      gameId: string;
      kind: string;
    };
    expect(payload.gameId).toBe(gameId);
    expect(payload.kind).toBe("event");
  });

  it("avisa al cambiar el estado del partido", async () => {
    const received: string[] = [];
    await harness.db.listen("alv_live", (payload) => {
      received.push(payload);
    });

    await serviceDb().exec(sql`
      update public.games set status = 'canceled' where id = ${gameId}
    `);

    const payload = JSON.parse(await nextNotification(received)) as {
      gameId: string;
      kind: string;
    };
    expect(payload.gameId).toBe(gameId);
    expect(payload.kind).toBe("status");
  });

  it("no avisa si el estado no cambió", async () => {
    const received: string[] = [];
    await harness.db.listen("alv_live", (payload) => {
      received.push(payload);
    });

    await serviceDb().exec(sql`
      update public.games set scheduled_at = scheduled_at where id = ${gameId}
    `);

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received).toEqual([]);
  });

  it("manda un aviso pequeño, muy por debajo del tope de pg_notify", async () => {
    const received: string[] = [];
    await harness.db.listen("alv_live", (payload) => {
      received.push(payload);
    });

    await serviceDb().exec(sql`
      update public.games set status = 'finalized' where id = ${gameId}
    `);

    const payload = await nextNotification(received);
    // pg_notify corta en 8000 bytes: el aviso lleva solo identificadores.
    expect(payload.length).toBeLessThan(200);
  });
});
