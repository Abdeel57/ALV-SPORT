import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./support/pg-harness";
import { actorForUser, anonDb, dbFor, serviceDb } from "../session";
import { sql } from "../sql";

/**
 * La garantía de seguridad de toda la migración: al hablar directo con
 * Postgres, el aislamiento sigue viniendo de las MISMAS políticas RLS.
 *
 * Estas pruebas usan el ejecutor real de la app (`dbFor`), que fija
 * `request.jwt.claims` y `SET LOCAL ROLE` por transacción — igual que hacía
 * PostgREST. Si esa mecánica se rompiera, aquí se vería de inmediato.
 */

const ORG_ID = "01000000-0000-4000-8000-000000000001";
const TEAM_COYOTES = "10000000-0000-4000-8000-000000000001";
const GAME_FINALIZED = "30000000-0000-4000-8000-000000000001";

let harness: Harness;
let scorekeeperId: string;
let outsiderId: string;
let openGameId: string;

async function createUser(email: string): Promise<string> {
  const row = await serviceDb().one<{ id: string }>(sql`
    insert into auth.users (email, aud, role)
    values (${email}, 'authenticated', 'authenticated')
    returning id
  `);
  return row.id;
}

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://pruebas/en-proceso";
  harness = await startHarness();

  scorekeeperId = await createUser("anotador@pruebas.test");
  outsiderId = await createUser("ajeno@pruebas.test");

  const db = serviceDb();
  await db.exec(sql`
    insert into public.organization_members (organization_id, user_id, role)
    values (${ORG_ID}, ${scorekeeperId}, 'scorekeeper')
  `);

  // Un partido abierto al que SÍ está asignado el anotador.
  const game = await db.one<{ id: string }>(sql`
    select id from public.games where status = 'scheduled' limit 1
  `);
  openGameId = game.id;
  await db.exec(sql`
    insert into public.game_assignments (game_id, user_id, role)
    values (${openGameId}, ${scorekeeperId}, 'scorekeeper')
  `);
  // start_game valida permisos con auth.uid(): lo inicia el anotador asignado.
  await dbFor(actorForUser(scorekeeperId)).exec(
    sql`select public.start_game(${openGameId})`,
  );
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

describe("RLS con el ejecutor real de la app", () => {
  it("deja al visitante leer el marcador de ligas publicadas", async () => {
    const rows = await anonDb().rows<{ id: string }>(sql`
      select id from public.game_events where game_id = ${GAME_FINALIZED} limit 5
    `);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("impide que el visitante inserte eventos", async () => {
    await expect(
      anonDb().exec(sql`
        insert into public.game_events (game_id, event_type, period, created_by)
        values (${openGameId}, 'run', 1, ${scorekeeperId})
      `),
    ).rejects.toThrow();
  });

  it("impide que el visitante modifique equipos", async () => {
    // Sin política de UPDATE, el RLS filtra en vez de lanzar error: la
    // sentencia corre pero no toca ninguna fila.
    const affected = await anonDb().exec(sql`
      update public.teams set name = 'HACKEADO FC' where id = ${TEAM_COYOTES}
    `);
    expect(affected).toBe(0);

    const team = await serviceDb().one<{ name: string }>(sql`
      select name from public.teams where id = ${TEAM_COYOTES}
    `);
    expect(team.name).not.toBe("HACKEADO FC");
  });

  it("deja al anotador asignado insertar en SU partido", async () => {
    const affected = await dbFor(actorForUser(scorekeeperId)).exec(sql`
      insert into public.game_events (game_id, team_id, event_type, period, created_by)
      values (${openGameId}, ${TEAM_COYOTES}, 'run', 1, ${scorekeeperId})
    `);
    expect(affected).toBe(1);
  });

  it("impide al anotador insertar en un partido ya finalizado", async () => {
    await expect(
      dbFor(actorForUser(scorekeeperId)).exec(sql`
        insert into public.game_events (game_id, team_id, event_type, period, created_by)
        values (${GAME_FINALIZED}, ${TEAM_COYOTES}, 'run', 1, ${scorekeeperId})
      `),
    ).rejects.toThrow();
  });

  it("impide insertar eventos a nombre de otro usuario", async () => {
    await expect(
      dbFor(actorForUser(scorekeeperId)).exec(sql`
        insert into public.game_events (game_id, team_id, event_type, period, created_by)
        values (${openGameId}, ${TEAM_COYOTES}, 'run', 1, ${outsiderId})
      `),
    ).rejects.toThrow();
  });

  it("impide a un usuario sin rol anotar en cualquier partido", async () => {
    await expect(
      dbFor(actorForUser(outsiderId)).exec(sql`
        insert into public.game_events (game_id, team_id, event_type, period, created_by)
        values (${openGameId}, ${TEAM_COYOTES}, 'run', 1, ${outsiderId})
      `),
    ).rejects.toThrow();
  });

  it("impide al anotador editar el nombre de un equipo", async () => {
    const affected = await dbFor(actorForUser(scorekeeperId))
      .exec(sql`update public.teams set name = 'HACKEADO FC' where id = ${TEAM_COYOTES}`)
      .catch(() => 0);
    expect(affected).toBe(0);
  });

  it("resuelve auth.uid() con la identidad de la transacción", async () => {
    const row = await dbFor(actorForUser(scorekeeperId)).one<{ uid: string | null }>(
      sql`select auth.uid()::text as uid`,
    );
    expect(row.uid).toBe(scorekeeperId);

    const anon = await anonDb().one<{ uid: string | null }>(
      sql`select auth.uid()::text as uid`,
    );
    expect(anon.uid).toBeNull();
  });

  it("no arrastra la identidad de una transacción a la siguiente", async () => {
    await dbFor(actorForUser(scorekeeperId)).one(sql`select auth.uid()`);
    // La conexión se reutiliza; SET LOCAL debe haber muerto con el commit.
    const after = await anonDb().one<{ uid: string | null; role: string }>(sql`
      select auth.uid()::text as uid, current_user::text as role
    `);
    expect(after.uid).toBeNull();
    expect(after.role).toBe("anon");
  });

  it("revierte la transacción completa si una sentencia falla", async () => {
    const db = dbFor(actorForUser(scorekeeperId));
    await expect(
      db.tx(async (tx) => {
        await tx.exec(sql`
          insert into public.game_events (game_id, team_id, event_type, period, created_by)
          values (${openGameId}, ${TEAM_COYOTES}, 'run', 1, ${scorekeeperId})
        `);
        throw new Error("falla a propósito");
      }),
    ).rejects.toThrow("falla a propósito");

    const count = await serviceDb().one<{ total: number }>(sql`
      select count(*)::int as total from public.game_events where game_id = ${openGameId}
    `);
    // Solo sobrevive el evento de la prueba anterior.
    expect(count.total).toBe(1);
  });
});
