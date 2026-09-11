import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./support/pg-harness";

/**
 * Aplica TODAS las migraciones y el seed contra un Postgres real en proceso.
 * Si una migración tiene un error de sintaxis o referencia algo que no
 * existe, esta prueba lo caza antes de tocar producción.
 */

let harness: Harness;

beforeAll(async () => {
  harness = await startHarness();
}, 120_000);

afterAll(async () => {
  await harness?.close();
});

describe("migraciones", () => {
  it("crean el esquema completo", async () => {
    const result = await harness.db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const tables = new Set(result.rows.map((row) => row.table_name));
    for (const table of [
      "organizations",
      "organization_members",
      "leagues",
      "seasons",
      "divisions",
      "teams",
      "players",
      "rosters",
      "games",
      "game_events",
      "game_lineups",
      "game_assignments",
      "registrations",
      "sanctions",
      "news",
      "sponsors",
      "audit_log",
      "push_subscriptions",
      "ai_jobs",
      "signup_requests",
    ]) {
      expect(tables, `falta la tabla ${table}`).toContain(table);
    }
  });

  it("dejan RLS activo en todas las tablas de negocio", async () => {
    const result = await harness.db.query<{ tablename: string }>(
      `select c.relname as tablename
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and not c.relrowsecurity
          and c.relname not like '\\_%'`,
    );
    expect(result.rows.map((row) => row.tablename)).toEqual([]);
  });

  it("crean los triggers del marcador en vivo", async () => {
    const result = await harness.db.query<{ tgname: string }>(
      `select tgname from pg_trigger where tgname like '%notify_live%' order by tgname`,
    );
    expect(result.rows.map((row) => row.tgname)).toEqual([
      "game_events_notify_live",
      "games_notify_live",
    ]);
  });

  it("siembran la temporada de ejemplo", async () => {
    const games = await harness.db.query<{ count: number }>(
      "select count(*)::int as count from public.games",
    );
    const events = await harness.db.query<{ count: number }>(
      "select count(*)::int as count from public.game_events",
    );
    expect(games.rows[0]?.count ?? 0).toBeGreaterThan(0);
    expect(events.rows[0]?.count ?? 0).toBeGreaterThan(0);
  });

  it("derivan standings desde los eventos", async () => {
    const result = await harness.db.query<{
      team_name: string;
      played: number;
      wins: number;
    }>(
      `select team_name, played, wins from public.public_standings
        order by points desc, team_name limit 3`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row.played).toBeGreaterThanOrEqual(row.wins);
    }
  });
});
