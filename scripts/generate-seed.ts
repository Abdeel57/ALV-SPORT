/**
 * Genera supabase/seed.sql desde lib/seed-data (fuente única de verdad).
 * Correr con: pnpm seed:generate
 * La salida es determinista: correrlo dos veces no produce diff.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeScore } from "../lib/engine/score";
import {
  SEED_ADMIN_USER_ID,
  allEvents,
  basketballConfig,
  courts,
  divisions,
  eventsByGameId,
  games,
  gameId,
  leagues,
  organization,
  players,
  rosters,
  seasons,
  softballConfig,
  sports,
  teams,
  venues,
} from "../lib/seed-data";

const q = (value: string): string => `'${value.replace(/'/g, "''")}'`;
const qn = (value: string | null): string => (value === null ? "null" : q(value));
const num = (value: number | null): string => (value === null ? "null" : String(value));
const jsonb = (value: unknown): string => `${q(JSON.stringify(value))}::jsonb`;

function insert(table: string, columns: string[], rows: string[][]): string {
  if (rows.length === 0) return "";
  const chunks: string[] = [];
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const values = rows
      .slice(i, i + CHUNK)
      .map((row) => `  (${row.join(", ")})`)
      .join(",\n");
    chunks.push(`insert into ${table} (${columns.join(", ")}) values\n${values};`);
  }
  return chunks.join("\n\n");
}

const sections: string[] = [];

sections.push(`-- =============================================================
-- GENERADO por scripts/generate-seed.ts — NO EDITAR A MANO.
-- Regenerar con: pnpm seed:generate
-- Fuente de verdad: lib/seed-data (los mismos objetos que prueban el motor).
-- =============================================================

begin;`);

// --- Usuario administrador del seed -------------------------------------
// game_events.created_by y organization_members.user_id requieren una fila
// en auth.users. Este insert mínimo funciona al aplicar el seed como rol
// postgres (supabase db push / SQL editor). Si tu proyecto lo rechaza,
// crea un usuario real en Auth y actualiza este UUID (ver README).
sections.push(`-- Usuario administrador ficticio del seed
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values (${q(SEED_ADMIN_USER_ID)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed-admin@alvsport.mx', '', now(), now(), now())
on conflict (id) do nothing;`);

sections.push(
  insert("public.organizations", ["id", "name", "slug"], [
    [q(organization.id), q(organization.name), q(organization.slug)],
  ]),
);

sections.push(
  insert("public.organization_members", ["organization_id", "user_id", "role"], [
    [q(organization.id), q(SEED_ADMIN_USER_ID), "'org_admin'"],
  ]),
);

sections.push(
  insert("public.sports", ["id", "key", "name", "config", "organization_id"],
    sports.map((sport) => [
      q(sport.id),
      q(sport.key),
      q(sport.name),
      jsonb(sport.key === "softball" ? softballConfig : basketballConfig),
      qn(sport.organizationId),
    ]),
  ),
);

sections.push(
  insert("public.leagues", ["id", "organization_id", "sport_id", "name", "slug", "is_published"],
    leagues.map((league) => [
      q(league.id),
      q(league.organizationId),
      q(league.sportId),
      q(league.name),
      q(league.slug),
      String(league.isPublished),
    ]),
  ),
);

sections.push(
  insert("public.seasons", ["id", "league_id", "name", "status", "starts_on", "ends_on"],
    seasons.map((season) => [
      q(season.id),
      q(season.leagueId),
      q(season.name),
      q(season.status),
      q(season.startsOn),
      q(season.endsOn),
    ]),
  ),
);

sections.push(
  insert("public.divisions", ["id", "season_id", "name", "sort_order"],
    divisions.map((division) => [
      q(division.id),
      q(division.seasonId),
      q(division.name),
      String(division.sortOrder),
    ]),
  ),
);

sections.push(
  insert("public.venues", ["id", "organization_id", "name", "address"],
    venues.map((venue) => [
      q(venue.id),
      q(venue.organizationId),
      q(venue.name),
      q(venue.address),
    ]),
  ),
);

sections.push(
  insert("public.courts", ["id", "venue_id", "name"],
    courts.map((court) => [q(court.id), q(court.venueId), q(court.name)]),
  ),
);

sections.push(
  insert("public.teams", ["id", "organization_id", "division_id", "name", "slug", "color"],
    teams.map((team) => [
      q(team.id),
      q(team.organizationId),
      q(team.divisionId),
      q(team.name),
      q(team.slug),
      q(team.color),
    ]),
  ),
);

sections.push(
  insert("public.players", ["id", "organization_id", "first_name", "last_name"],
    players.map((player) => [
      q(player.id),
      q(player.organizationId),
      q(player.firstName),
      q(player.lastName),
    ]),
  ),
);

sections.push(
  insert("public.rosters", ["team_id", "player_id", "jersey_number", "position"],
    rosters.map((entry) => [
      q(entry.teamId),
      q(entry.playerId),
      q(entry.jerseyNumber),
      q(entry.position),
    ]),
  ),
);

// El caché home_score/away_score de juegos finalizados se DERIVA del motor
// (nunca a mano): misma fuente que las pruebas.
const gameRows = games.map((game) => {
  let homeScore: number | null = null;
  let awayScore: number | null = null;
  if (game.status === "finalized") {
    const config = game.seasonId === seasons[0]?.id ? softballConfig : basketballConfig;
    const score = computeScore(eventsByGameId.get(game.id) ?? [], config);
    homeScore = score.byTeam[game.homeTeamId]?.total ?? 0;
    awayScore = score.byTeam[game.awayTeamId]?.total ?? 0;
  }
  return [
    q(game.id),
    q(game.seasonId),
    qn(game.divisionId),
    q(game.homeTeamId),
    q(game.awayTeamId),
    qn(game.venueId),
    qn(game.courtId),
    q(game.scheduledAt),
    q(game.status),
    qn(game.finalizedAt),
    num(homeScore),
    num(awayScore),
  ];
});

sections.push(
  insert(
    "public.games",
    [
      "id", "season_id", "division_id", "home_team_id", "away_team_id",
      "venue_id", "court_id", "scheduled_at", "status", "finalized_at",
      "home_score", "away_score",
    ],
    gameRows,
  ),
);

// El admin del seed queda asignado como anotador del juego programado.
sections.push(
  insert("public.game_assignments", ["game_id", "user_id", "role"], [
    [q(gameId(10)), q(SEED_ADMIN_USER_ID), "'scorekeeper'"],
  ]),
);

// game_events: seq es identity — el orden de inserción preserva el orden
// del stream, que es lo único que el motor requiere.
sections.push(
  insert(
    "public.game_events",
    [
      "id", "game_id", "team_id", "player_id", "event_type", "payload",
      "period", "clock_seconds", "corrects_event_id", "created_by", "created_at",
    ],
    allEvents.map((event) => [
      q(event.id),
      q(event.gameId),
      qn(event.teamId),
      qn(event.playerId),
      q(event.eventType),
      jsonb(event.payload),
      num(event.period),
      num(event.clockSeconds),
      qn(event.correctsEventId),
      q(event.createdBy),
      q(event.createdAt),
    ]),
  ),
);

sections.push(`-- Standings se deriva: refrescar la vista materializada tras sembrar.
refresh materialized view public.standings;

commit;`);

const sql = sections.filter(Boolean).join("\n\n") + "\n";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outPath = join(scriptDir, "..", "supabase", "seed.sql");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, sql, { encoding: "utf8" });

const eventCount = allEvents.length;
console.log(`seed.sql generado: ${games.length} juegos, ${eventCount} eventos, ${players.length} jugadores.`);
