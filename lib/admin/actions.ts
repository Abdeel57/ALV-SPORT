"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { requireAdmin, type AdminContext } from "./auth";
import { createMpPreference } from "./mercadopago";
import {
  assignmentSchema,
  cashPaymentSchema,
  courtSchema,
  divisionSchema,
  formDataToObject,
  gameCreateSchema,
  gameUpdateSchema,
  leagueSchema,
  newsSchema,
  playerSchema,
  registrationCreateSchema,
  rosterAssignSchema,
  rosterBulkSchema,
  sanctionSchema,
  finalScoreSchema,
  scheduleConfigSchema,
  seasonSchema,
  sponsorSchema,
  teamSchema,
  venueSchema,
} from "./schemas";
import { parseRosterList } from "./roster-list";
import { assign, ident, insertRow, insertRows, sql, type SqlValue } from "@/lib/db";
import { MediaError, saveImage, type MediaBucket } from "@/lib/media/store";
import { assignSlots, generateRoundRobin, sportConfigSchema } from "@/lib/engine";
import { approveCoachSchema, approvePlayerSchema } from "@/lib/signup/schemas";
import { seasonLabel, slugify, splitFullName } from "@/lib/utils";

async function ctx(): Promise<AdminContext> {
  const context = await requireAdmin();
  if (!context) redirect("/admin");
  return context;
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function done(path: string): never {
  revalidatePath(path);
  revalidatePath("/admin");
  redirect(`${path}?ok=1`);
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos inválidos";
}

function parse<T>(schema: z.ZodType<T>, formData: FormData, path: string): T {
  const result = schema.safeParse(formDataToObject(formData));
  if (!result.success) fail(path, firstIssue(result.error));
  return result.data;
}

/* --------------------- Errores de la base de datos -------------------- */

/**
 * `redirect()` y `notFound()` de Next funcionan lanzando una excepción con
 * `digest`. Nunca deben confundirse con un error de la base.
 */
function isControlFlow(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest: unknown }).digest === "string",
  );
}

function dbMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Error de base de datos";
}

/** Código SQLSTATE del error de Postgres (23505 = duplicado, 23503 = referencia). */
function dbCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

/**
 * Ejecuta una operación contra la base y convierte cualquier fallo en el
 * mismo mensaje de error que ya mostraba el panel.
 */
async function run<T>(path: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isControlFlow(error)) throw error;
    fail(path, dbMessage(error));
  }
}

/* ------------------------------ Imágenes ------------------------------ */

async function uploadImage(
  context: AdminContext,
  bucket: MediaBucket,
  formData: FormData,
  field: string,
  path: string,
): Promise<string | null> {
  const file = formData.get(field);
  if (!(file instanceof File) || file.size === 0) return null;
  try {
    return await saveImage(bucket, context.organizationId, file);
  } catch (error) {
    if (isControlFlow(error)) throw error;
    if (error instanceof MediaError) fail(path, error.message);
    fail(path, `No se pudo subir la imagen: ${dbMessage(error)}`);
  }
}

/* --------------------------- CRUD genérico ---------------------------- */

async function upsertRow(
  context: AdminContext,
  table: string,
  id: string | undefined,
  row: Record<string, SqlValue>,
  path: string,
): Promise<void> {
  await run(path, () =>
    id
      ? context.db.exec(
          sql`update ${ident("public", table)} set ${assign(row)} where id = ${id}`,
        )
      : context.db.exec(
          sql`insert into ${ident("public", table)} ${insertRow(row)}`,
        ),
  );
}

async function deleteRow(
  context: AdminContext,
  table: string,
  id: string,
  path: string,
): Promise<never> {
  await run(path, () =>
    context.db.exec(sql`delete from ${ident("public", table)} where id = ${id}`),
  );
  done(path);
}

/* -------------------------------- Ligas ------------------------------- */

const LEAGUES = "/admin/ligas";

export async function saveLeague(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(leagueSchema, formData, LEAGUES);
  const logoUrl = await uploadImage(context, "league-logos", formData, "logo", LEAGUES);

  if (data.id) {
    // Edición: identidad únicamente. El deporte y el slug no cambian una vez
    // creada la liga (cambiar el deporte rompería eventos/standings; el slug
    // es la URL pública).
    const row: Record<string, SqlValue> = { name: data.name, color: data.color };
    if (logoUrl) row.logo_url = logoUrl;
    await upsertRow(context, "leagues", data.id, row, LEAGUES);
    done(LEAGUES);
  }

  // Alta con asistente: liga → primera temporada → divisiones. La liga nace
  // OCULTA (is_published default false): se arma completa en privado y se
  // publica con el switch cuando está lista.
  let leagueId: string;
  try {
    const inserted = await context.db.one<{ id: string }>(sql`
      insert into public.leagues (organization_id, sport_id, name, slug, color, logo_url)
      values (${context.organizationId}, ${data.sportId}, ${data.name},
              ${slugify(data.name)}, ${data.color}, ${logoUrl})
      returning id
    `);
    leagueId = inserted.id;
  } catch (error) {
    if (isControlFlow(error)) throw error;
    fail(
      LEAGUES,
      dbCode(error) === "23505"
        ? "Ya existe una liga con un nombre muy similar; cambia el nombre"
        : dbMessage(error),
    );
  }

  if (data.seasonName) {
    let seasonId: string;
    try {
      const season = await context.db.one<{ id: string }>(sql`
        insert into public.seasons (league_id, name, status, starts_on, ends_on)
        values (${leagueId}, ${data.seasonName}, 'draft',
                ${data.startsOn ?? null}, ${data.endsOn ?? null})
        returning id
      `);
      seasonId = season.id;
    } catch (error) {
      if (isControlFlow(error)) throw error;
      fail(LEAGUES, `La liga se creó, pero la temporada falló: ${dbMessage(error)}`);
    }

    const divisionNames = (data.divisions ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (divisionNames.length > 0) {
      try {
        await context.db.exec(sql`
          insert into public.divisions ${insertRows(
            divisionNames.map((name, index) => ({
              season_id: seasonId,
              name,
              sort_order: index,
            })),
          )}
        `);
      } catch (error) {
        if (isControlFlow(error)) throw error;
        fail(
          LEAGUES,
          `Liga y temporada creadas, pero las divisiones fallaron: ${dbMessage(error)}`,
        );
      }
    }
  }
  done(LEAGUES);
}

export async function setLeaguePublished(id: string, publish: boolean): Promise<void> {
  const context = await ctx();
  await run(LEAGUES, () =>
    context.db.exec(
      sql`update public.leagues set is_published = ${publish} where id = ${id}`,
    ),
  );
  // La compuerta de visibilidad afecta al sitio público de inmediato.
  revalidatePath("/");
  revalidatePath("/tabla");
  done(LEAGUES);
}

export async function deleteLeague(id: string): Promise<void> {
  await deleteRow(await ctx(), "leagues", id, LEAGUES);
}

/* ---------------------- Temporadas y divisiones ---------------------- */

const SEASONS = "/admin/temporadas";

export async function saveSeason(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(seasonSchema, formData, SEASONS);
  await upsertRow(
    context,
    "seasons",
    data.id,
    {
      league_id: data.leagueId,
      name: data.name,
      status: data.status,
      starts_on: data.startsOn ?? null,
      ends_on: data.endsOn ?? null,
    },
    SEASONS,
  );
  done(SEASONS);
}

export async function deleteSeason(id: string): Promise<void> {
  await deleteRow(await ctx(), "seasons", id, SEASONS);
}

export async function saveDivision(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(divisionSchema, formData, SEASONS);
  await upsertRow(
    context,
    "divisions",
    data.id,
    { season_id: data.seasonId, name: data.name, sort_order: data.sortOrder },
    SEASONS,
  );
  done(SEASONS);
}

export async function deleteDivision(id: string): Promise<void> {
  await deleteRow(await ctx(), "divisions", id, SEASONS);
}

/* --------------------------- Sedes y canchas -------------------------- */

const VENUES = "/admin/sedes";

export async function saveVenue(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(venueSchema, formData, VENUES);
  await upsertRow(
    context,
    "venues",
    data.id,
    {
      organization_id: context.organizationId,
      name: data.name,
      address: data.address ?? null,
    },
    VENUES,
  );
  done(VENUES);
}

export async function deleteVenue(id: string): Promise<void> {
  await deleteRow(await ctx(), "venues", id, VENUES);
}

export async function saveCourt(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(courtSchema, formData, VENUES);
  await upsertRow(
    context,
    "courts",
    data.id,
    { venue_id: data.venueId, name: data.name },
    VENUES,
  );
  done(VENUES);
}

export async function deleteCourt(id: string): Promise<void> {
  await deleteRow(await ctx(), "courts", id, VENUES);
}

/* ------------------------------- Equipos ------------------------------ */

const TEAMS = "/admin/equipos";

export async function saveTeam(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(teamSchema, formData, TEAMS);
  const logoUrl = await uploadImage(context, "team-logos", formData, "logo", TEAMS);
  const row: Record<string, SqlValue> = {
    organization_id: context.organizationId,
    division_id: data.divisionId,
    name: data.name,
    slug: data.slug,
    color: data.color,
  };
  if (logoUrl) row.logo_url = logoUrl;
  await upsertRow(context, "teams", data.id, row, TEAMS);
  done(TEAMS);
}

export async function deleteTeam(id: string): Promise<void> {
  await deleteRow(await ctx(), "teams", id, TEAMS);
}

/* ------------------------------ Jugadores ----------------------------- */

const PLAYERS = "/admin/jugadores";

export async function savePlayer(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(playerSchema, formData, PLAYERS);
  const photoUrl = await uploadImage(context, "player-photos", formData, "photo", PLAYERS);
  const row: Record<string, SqlValue> = {
    organization_id: context.organizationId,
    first_name: data.firstName,
    last_name: data.lastName,
    birthdate: data.birthdate ?? null,
  };
  if (photoUrl) row.photo_url = photoUrl;
  await upsertRow(context, "players", data.id, row, PLAYERS);
  done(PLAYERS);
}

export async function deletePlayer(id: string): Promise<void> {
  await deleteRow(await ctx(), "players", id, PLAYERS);
}

export async function assignToRoster(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(rosterAssignSchema, formData, PLAYERS);

  // Elegibilidad: el jugador no puede estar en otro equipo de la misma división.
  const team = await run(PLAYERS, () =>
    context.db.maybeOne<{ division_id: string }>(sql`
      select division_id from public.teams where id = ${data.teamId} limit 1
    `),
  );
  if (!team) fail(PLAYERS, "Equipo inválido");

  const conflict = await run(PLAYERS, () =>
    context.db.maybeOne<{ id: string }>(sql`
      select r.id
        from public.rosters r
        join public.teams t on t.id = r.team_id
       where r.player_id = ${data.playerId}
         and r.status = 'active'
         and t.division_id = ${team.division_id}
       limit 1
    `),
  );
  if (conflict) fail(PLAYERS, "El jugador ya está en un roster de esta división");

  await run(PLAYERS, () =>
    context.db.exec(sql`
      insert into public.rosters (team_id, player_id, jersey_number, position)
      values (${data.teamId}, ${data.playerId}, ${data.jerseyNumber ?? null},
              ${data.position ?? null})
    `),
  );
  done(PLAYERS);
}

export async function removeFromRoster(id: string): Promise<void> {
  await deleteRow(await ctx(), "rosters", id, PLAYERS);
}

/**
 * Alta por lista: crea de un golpe los jugadores pegados (una línea cada uno,
 * número opcional) y los asigna al roster del equipo. Un nombre que ya existe
 * en la organización se reutiliza en lugar de duplicarse; quien ya esté en un
 * roster activo de la división se omite y se reporta, igual que la regla de
 * elegibilidad del alta individual.
 */
export async function bulkAssignRoster(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(rosterBulkSchema, formData, PLAYERS);
  const { entries, errors } = parseRosterList(data.list);
  if (errors.length > 0) fail(PLAYERS, errors.slice(0, 3).join(" · "));

  const team = await run(PLAYERS, () =>
    context.db.maybeOne<{ division_id: string; name: string }>(sql`
      select division_id, name from public.teams where id = ${data.teamId} limit 1
    `),
  );
  if (!team) fail(PLAYERS, "Equipo inválido");

  // Reusar homónimos exactos de la organización (RLS acota el tenant).
  const nameKey = (first: string, last: string) =>
    `${first} ${last}`.toLocaleLowerCase("es-MX");
  const playerRows = await run(PLAYERS, () =>
    context.db.rows<{ id: string; first_name: string; last_name: string }>(sql`
      select id, first_name, last_name from public.players
    `),
  );
  const existingByName = new Map(
    playerRows.map((player) => [
      nameKey(player.first_name, player.last_name),
      player.id,
    ]),
  );

  const matchedIds = entries
    .map((entry) => existingByName.get(nameKey(entry.firstName, entry.lastName)))
    .filter((id): id is string => id !== undefined);
  const alreadyInDivision = new Set<string>();
  if (matchedIds.length > 0) {
    const conflictRows = await run(PLAYERS, () =>
      context.db.rows<{ player_id: string }>(sql`
        select r.player_id
          from public.rosters r
          join public.teams t on t.id = r.team_id
         where r.player_id = any(${matchedIds}::uuid[])
           and r.status = 'active'
           and t.division_id = ${team.division_id}
      `),
    );
    for (const row of conflictRows) alreadyInDivision.add(row.player_id);
  }

  const toCreate = entries.filter(
    (entry) => !existingByName.has(nameKey(entry.firstName, entry.lastName)),
  );
  if (toCreate.length > 0) {
    const createdRows = await run(PLAYERS, () =>
      context.db.rows<{ id: string; first_name: string; last_name: string }>(sql`
        insert into public.players ${insertRows(
          toCreate.map((entry) => ({
            organization_id: context.organizationId,
            first_name: entry.firstName,
            last_name: entry.lastName,
          })),
        )}
        returning id, first_name, last_name
      `),
    );
    for (const row of createdRows) {
      existingByName.set(nameKey(row.first_name, row.last_name), row.id);
    }
  }

  const rosterRows: Record<string, SqlValue>[] = [];
  let skipped = 0;
  for (const entry of entries) {
    const playerId = existingByName.get(nameKey(entry.firstName, entry.lastName));
    if (!playerId) continue;
    if (alreadyInDivision.has(playerId)) {
      skipped += 1;
      continue;
    }
    rosterRows.push({
      team_id: data.teamId,
      player_id: playerId,
      jersey_number: entry.jerseyNumber,
    });
  }
  if (rosterRows.length > 0) {
    await run(PLAYERS, () =>
      context.db.exec(sql`insert into public.rosters ${insertRows(rosterRows)}`),
    );
  }

  const message =
    `${rosterRows.length} jugador${rosterRows.length === 1 ? "" : "es"} en el roster de ${team.name}` +
    (skipped > 0
      ? ` · ${skipped} ya estaba${skipped === 1 ? "" : "n"} en la división (omitidos)`
      : "");
  revalidatePath(PLAYERS);
  revalidatePath("/admin");
  redirect(`${PLAYERS}?ok=${encodeURIComponent(message)}`);
}

/* ------------------------------ Calendario ---------------------------- */

const SCHEDULE = "/admin/calendario";

export async function publishSchedule(formData: FormData): Promise<void> {
  const context = await ctx();
  const generatePath = "/admin/calendario/generar";
  const data = parse(scheduleConfigSchema, formData, generatePath);

  const teamRows = await run(generatePath, () =>
    context.db.rows<{ id: string }>(sql`
      select id from public.teams where division_id = ${data.divisionId}
    `),
  );
  const teamIds = teamRows.map((row) => row.id);
  if (teamIds.length < 2) fail(generatePath, "La división necesita al menos 2 equipos");

  const division = await run(generatePath, () =>
    context.db.maybeOne<{ season_id: string }>(sql`
      select season_id from public.divisions where id = ${data.divisionId} limit 1
    `),
  );
  if (!division) fail(generatePath, "División inválida");

  const courtRows = await run(generatePath, () =>
    context.db.rows<{ id: string; venue_id: string }>(sql`
      select id, venue_id from public.courts where id = any(${data.courtIds}::uuid[])
    `),
  );
  const venueByCourt = new Map(courtRows.map((row) => [row.id, row.venue_id]));

  const fixtures = assignSlots(
    generateRoundRobin(teamIds, { doubleRound: data.doubleRound }),
    {
      startDate: data.startDate,
      weekdays: data.weekdays,
      times: data.times,
      courtIds: data.courtIds,
      minRestDays: data.minRestDays,
    },
  );

  // Sugerencias, no imposición: el admin publica solo los partidos que dejó
  // seleccionados en la vista previa (el algoritmo es determinista, así que
  // los índices de la vista previa y de esta corrida coinciden).
  const included = data.include
    ? fixtures.filter((_, index) => data.include?.includes(index))
    : fixtures;
  if (included.length === 0) {
    fail(generatePath, "Selecciona al menos un partido para publicar");
  }

  const rows: Record<string, SqlValue>[] = included.map((fixture) => ({
    season_id: division.season_id,
    division_id: data.divisionId,
    home_team_id: fixture.homeTeamId,
    away_team_id: fixture.awayTeamId,
    court_id: fixture.courtId,
    venue_id: venueByCourt.get(fixture.courtId) ?? null,
    scheduled_at: fixture.scheduledAt,
    status: "scheduled",
  }));
  await run(generatePath, () =>
    context.db.exec(sql`insert into public.games ${insertRows(rows)}`),
  );
  done(SCHEDULE);
}

// Los formularios usan datetime-local sin zona; la liga opera en el centro de
// México (UTC-6 fijo, sin horario de verano desde 2022). Interpretar la hora
// en la zona del servidor (UTC en Railway) la correría 6 horas.
const MX_UTC_OFFSET = "-06:00";

function localToIso(local: string): string {
  return new Date(`${local.slice(0, 16)}:00${MX_UTC_OFFSET}`).toISOString();
}

/** venue_id se deriva del campo elegido (o null si el partido queda sin campo). */
async function venueIdForCourt(
  context: AdminContext,
  courtId: string | null,
): Promise<string | null> {
  if (!courtId) return null;
  const court = await context.db.maybeOne<{ venue_id: string }>(sql`
    select venue_id from public.courts where id = ${courtId} limit 1
  `);
  return court?.venue_id ?? null;
}

/** Ambos equipos deben existir y pertenecer a la división del partido. */
async function assertTeamsInDivision(
  context: AdminContext,
  divisionId: string,
  teamIds: readonly string[],
  path: string,
): Promise<void> {
  const rows = await run(path, () =>
    context.db.rows<{ id: string }>(sql`
      select id from public.teams
       where division_id = ${divisionId} and id = any(${[...teamIds]}::uuid[])
    `),
  );
  if (rows.length !== new Set(teamIds).size) {
    fail(path, "Los equipos deben pertenecer a la división del partido");
  }
}

export async function createGame(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(gameCreateSchema, formData, SCHEDULE);
  await assertTeamsInDivision(
    context,
    data.divisionId,
    [data.homeTeamId, data.awayTeamId],
    SCHEDULE,
  );

  const division = await run(SCHEDULE, () =>
    context.db.maybeOne<{ season_id: string }>(sql`
      select season_id from public.divisions where id = ${data.divisionId} limit 1
    `),
  );
  if (!division) fail(SCHEDULE, "División inválida");

  const venueId = await venueIdForCourt(context, data.courtId);
  await run(SCHEDULE, () =>
    context.db.exec(sql`
      insert into public.games
        (season_id, division_id, home_team_id, away_team_id, court_id, venue_id,
         scheduled_at, status)
      values (${division.season_id}, ${data.divisionId}, ${data.homeTeamId},
              ${data.awayTeamId}, ${data.courtId}, ${venueId},
              ${localToIso(data.scheduledAt)}, 'scheduled')
    `),
  );
  done(SCHEDULE);
}

/**
 * Resultado final directo desde el calendario: sin alineaciones ni mesa.
 * Respeta la arquitectura — inserta eventos de anotación (delta +1) hasta el
 * marcador objetivo y cierra con finalize_game(), que DERIVA el marcador de
 * los eventos; nunca se escribe un total a mano.
 */
export async function submitFinalScore(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(finalScoreSchema, formData, SCHEDULE);

  const game = await run(SCHEDULE, () =>
    context.db.maybeOne<{
      id: string;
      status: string;
      season_id: string;
      home_team_id: string;
      away_team_id: string;
    }>(sql`
      select id, status::text as status, season_id, home_team_id, away_team_id
        from public.games
       where id = ${data.gameId}
       limit 1
    `),
  );
  if (!game) fail(SCHEDULE, "El partido no existe");
  if (game.status === "finalized" || game.status === "canceled") {
    fail(
      SCHEDULE,
      game.status === "canceled"
        ? "El partido está cancelado"
        : "El partido ya está finalizado",
    );
  }

  const season = await run(SCHEDULE, () =>
    context.db.maybeOne<{ config: unknown }>(sql`
      select sp.config
        from public.seasons se
        join public.leagues l on l.id = se.league_id
        join public.sports sp on sp.id = l.sport_id
       where se.id = ${game.season_id}
       limit 1
    `),
  );
  const config = sportConfigSchema.parse(season?.config);
  const pointEvent = config.eventTypes.find((eventType) => eventType.scoreDelta === 1);
  if (!pointEvent || config.standings.winnerBy === "periods_won") {
    fail(SCHEDULE, "Este deporte se define por sets: usa la mesa de anotación");
  }

  // Totales actuales DERIVADOS (respetan correcciones): el resultado directo
  // solo puede agregar anotaciones sobre lo ya capturado en la mesa.
  const scoreRows = await run(SCHEDULE, () =>
    context.db.rows<{ team_id: string; score: number }>(sql`
      select team_id, score from public.game_team_scores where game_id = ${game.id}
    `),
  );
  const current = new Map(scoreRows.map((row) => [row.team_id, row.score]));
  const targets = [
    { teamId: game.away_team_id, target: data.awayScore },
    { teamId: game.home_team_id, target: data.homeScore },
  ];
  for (const { teamId, target } of targets) {
    if (target < (current.get(teamId) ?? 0)) {
      fail(SCHEDULE, "El marcador no puede ser menor a lo ya anotado en la mesa");
    }
  }

  if (game.status === "scheduled") {
    await run(SCHEDULE, () =>
      context.db.exec(sql`select public.start_game(${game.id})`),
    );
  }

  const rows: Record<string, SqlValue>[] = targets.flatMap(({ teamId, target }) =>
    Array.from({ length: target - (current.get(teamId) ?? 0) }, () => ({
      game_id: game.id,
      team_id: teamId,
      player_id: null,
      event_type: pointEvent.key,
      payload: {},
      period: 1,
      created_by: context.userId,
    })),
  );
  if (rows.length > 0) {
    await run(SCHEDULE, () =>
      context.db.exec(sql`insert into public.game_events ${insertRows(rows)}`),
    );
  }

  await run(SCHEDULE, () =>
    context.db.exec(sql`select public.finalize_game(${game.id})`),
  );
  done(SCHEDULE);
}

export async function updateGame(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(gameUpdateSchema, formData, SCHEDULE);
  const patch: Record<string, SqlValue> = {
    scheduled_at: localToIso(data.scheduledAt),
    court_id: data.courtId,
    venue_id: await venueIdForCourt(context, data.courtId),
  };

  const changesTeams = data.homeTeamId !== undefined && data.awayTeamId !== undefined;
  if (!changesTeams) {
    await run(SCHEDULE, () =>
      context.db.exec(
        sql`update public.games set ${assign(patch)} where id = ${data.gameId}`,
      ),
    );
    done(SCHEDULE);
  }

  const gameRow = await run(SCHEDULE, () =>
    context.db.maybeOne<{ division_id: string | null }>(sql`
      select division_id from public.games where id = ${data.gameId} limit 1
    `),
  );
  const divisionId = gameRow?.division_id ?? null;
  if (divisionId && data.homeTeamId && data.awayTeamId) {
    await assertTeamsInDivision(
      context,
      divisionId,
      [data.homeTeamId, data.awayTeamId],
      SCHEDULE,
    );
  }
  patch.home_team_id = data.homeTeamId ?? null;
  patch.away_team_id = data.awayTeamId ?? null;

  // Con eventos ya anotados los rivales no se tocan: solo partidos programados.
  await run(SCHEDULE, () =>
    context.db.exec(sql`
      update public.games set ${assign(patch)}
       where id = ${data.gameId} and status = 'scheduled'
    `),
  );
  done(SCHEDULE);
}

export async function deleteGame(id: string): Promise<void> {
  const context = await ctx();
  await run(SCHEDULE, () =>
    context.db.exec(
      sql`delete from public.games where id = ${id} and status = 'scheduled'`,
    ),
  );
  done(SCHEDULE);
}

export async function assignOfficial(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(assignmentSchema, formData, SCHEDULE);

  const lookup = await run(SCHEDULE, () =>
    context.db.maybeOne<{ id: string | null }>(sql`
      select public.user_id_by_email(${data.email}) as id
    `),
  );
  const userId = lookup?.id ?? null;
  if (!userId) {
    fail(
      SCHEDULE,
      `No existe un usuario con el correo ${data.email}. Pídele crear su cuenta primero.`,
    );
  }

  await run(SCHEDULE, () =>
    context.db.exec(sql`
      insert into public.game_assignments (game_id, user_id, role)
      values (${data.gameId}, ${userId}, ${data.role})
    `),
  );
  done(SCHEDULE);
}

export async function removeAssignment(id: string): Promise<void> {
  await deleteRow(await ctx(), "game_assignments", id, SCHEDULE);
}

/* ----------------------- Inscripciones y pagos ------------------------ */

const REGISTRATIONS = "/admin/inscripciones";

export async function createRegistration(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(registrationCreateSchema, formData, REGISTRATIONS);
  await run(REGISTRATIONS, () =>
    context.db.exec(sql`
      insert into public.registrations (season_id, team_id, amount, requested_by)
      values (${data.seasonId}, ${data.teamId}, ${data.amount}, ${context.userId})
    `),
  );
  done(REGISTRATIONS);
}

async function setRegistrationStatus(id: string, status: string): Promise<void> {
  const context = await ctx();
  await run(REGISTRATIONS, () =>
    context.db.exec(
      sql`update public.registrations set status = ${status} where id = ${id}`,
    ),
  );
  done(REGISTRATIONS);
}

export async function approveRegistration(id: string): Promise<void> {
  await setRegistrationStatus(id, "approved");
}

export async function rejectRegistration(id: string): Promise<void> {
  await setRegistrationStatus(id, "rejected");
}

export async function registerCashPayment(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(cashPaymentSchema, formData, REGISTRATIONS);
  await run(REGISTRATIONS, () =>
    context.db.exec(sql`
      update public.registrations
         set status = 'paid',
             payment_method = 'cash',
             payment_ref = ${data.paymentRef ?? null},
             note = ${data.note}
       where id = ${data.registrationId}
    `),
  );
  done(REGISTRATIONS);
}

export async function createMpCheckout(id: string): Promise<void> {
  const context = await ctx();
  const registration = await run(REGISTRATIONS, () =>
    context.db.maybeOne<{
      id: string;
      amount: number | null;
      team_name: string | null;
      season_name: string | null;
      league_name: string | null;
    }>(sql`
      select r.id, r.amount,
             t.name as team_name,
             se.name as season_name,
             l.name as league_name
        from public.registrations r
        left join public.teams t on t.id = r.team_id
        left join public.seasons se on se.id = r.season_id
        left join public.leagues l on l.id = se.league_id
       where r.id = ${id}
       limit 1
    `),
  );
  if (!registration?.amount) {
    fail(REGISTRATIONS, "La inscripción necesita un monto para generar el pago");
  }

  const season = registration.season_name
    ? {
        name: registration.season_name,
        leagues: registration.league_name ? { name: registration.league_name } : null,
      }
    : null;

  try {
    const link = await createMpPreference({
      registrationId: registration.id,
      title: `Inscripción ${registration.team_name ?? ""} · ${seasonLabel(season)}`,
      amount: Number(registration.amount),
    });
    redirect(`${REGISTRATIONS}?mp_link=${encodeURIComponent(link)}`);
  } catch (error) {
    if (isControlFlow(error)) throw error;
    fail(
      REGISTRATIONS,
      error instanceof Error ? error.message : "No se pudo generar el pago",
    );
  }
}

/* ------------------------------ Sanciones ----------------------------- */

const SANCTIONS = "/admin/sanciones";

export async function createSanction(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(sanctionSchema, formData, SANCTIONS);
  await run(SANCTIONS, () =>
    context.db.exec(sql`
      insert into public.sanctions
        (organization_id, player_id, reason, games_count, starts_on, created_by)
      values (${context.organizationId}, ${data.playerId}, ${data.reason},
              ${data.gamesCount}, ${data.startsOn}, ${context.userId})
    `),
  );
  done(SANCTIONS);
}

export async function cancelSanction(id: string): Promise<void> {
  const context = await ctx();
  await run(SANCTIONS, () =>
    context.db.exec(
      sql`update public.sanctions set status = 'canceled' where id = ${id}`,
    ),
  );
  done(SANCTIONS);
}

/* ------------------------- Noticias y sponsors ------------------------ */

const NEWS = "/admin/noticias";

export async function saveNews(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(newsSchema, formData, NEWS);
  const imageUrl = await uploadImage(context, "news-images", formData, "image", NEWS);
  const row: Record<string, SqlValue> = {
    organization_id: context.organizationId,
    title: data.title,
    body: data.body,
    status: data.publish ? "published" : "draft",
    published_at: data.publish ? new Date().toISOString() : null,
    created_by: context.userId,
  };
  if (imageUrl) row.image_url = imageUrl;
  await upsertRow(context, "news", data.id, row, NEWS);
  done(NEWS);
}

export async function deleteNews(id: string): Promise<void> {
  await deleteRow(await ctx(), "news", id, NEWS);
}

const SPONSORS = "/admin/patrocinadores";

export async function saveSponsor(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(sponsorSchema, formData, SPONSORS);
  const logoUrl = await uploadImage(context, "sponsor-logos", formData, "logo", SPONSORS);
  const row: Record<string, SqlValue> = {
    organization_id: context.organizationId,
    name: data.name,
    link_url: data.linkUrl,
    placement: data.placement,
    sort_order: data.sortOrder,
    is_active: true,
  };
  if (logoUrl) row.logo_url = logoUrl;
  await upsertRow(context, "sponsors", data.id, row, SPONSORS);
  done(SPONSORS);
}

export async function deleteSponsor(id: string): Promise<void> {
  await deleteRow(await ctx(), "sponsors", id, SPONSORS);
}

/* --------------------------- IA (Fase 4) ------------------------------ */

export async function regenerateAiNews(gameId: string): Promise<void> {
  await ctx(); // solo admin/manager
  const { runAiJob } = await import("@/lib/ai/job");
  const result = await runAiJob(gameId, { force: true });
  if (!result.ok) {
    fail(NEWS, result.error ?? "No se pudo regenerar la crónica");
  }
  done(NEWS);
}

/* ----------------- Solicitudes de auto-registro (Fase 6) --------------- */

const SIGNUPS = "/admin/solicitudes";

interface SignupRow {
  id: string;
  kind: "coach" | "player";
  status: string;
  season_id: string | null;
  full_name: string;
  team_name: string | null;
  resolved_team_id: string | null;
  resolved_player_id: string | null;
}

async function loadSignup(context: AdminContext, id: string): Promise<SignupRow> {
  const row = await run(SIGNUPS, () =>
    context.db.maybeOne<SignupRow>(sql`
      select id, kind::text as kind, status::text as status, season_id, full_name,
             team_name, resolved_team_id, resolved_player_id
        from public.signup_requests
       where id = ${id}
       limit 1
    `),
  );
  if (!row) fail(SIGNUPS, "La solicitud no existe");
  return row;
}

async function closeSignup(
  context: AdminContext,
  id: string,
  patch: Record<string, SqlValue>,
): Promise<void> {
  await run(SIGNUPS, () =>
    context.db.exec(sql`
      update public.signup_requests
         set ${assign({
           ...patch,
           reviewed_by: context.userId,
           reviewed_at: new Date().toISOString(),
         })}
       where id = ${id}
    `),
  );
}

/** Aprueba a un coach: crea su equipo y siembra la inscripción (pago). */
export async function approveCoachRequest(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(approveCoachSchema, formData, SIGNUPS);
  const request = await loadSignup(context, data.requestId);
  if (request.kind !== "coach") fail(SIGNUPS, "Esta solicitud no es de coach");
  if (request.resolved_team_id) fail(SIGNUPS, "El equipo ya fue creado");

  const created = await run(SIGNUPS, () =>
    context.db.one<{ id: string }>(sql`
      insert into public.teams (organization_id, division_id, name, slug, color)
      values (${context.organizationId}, ${data.divisionId},
              ${request.team_name ?? request.full_name}, ${data.slug}, ${data.color})
      returning id
    `),
  );
  const teamId = created.id;

  // Siembra la inscripción (queda pendiente de pago en /admin/inscripciones).
  if (request.season_id) {
    await run(SIGNUPS, () =>
      context.db.exec(sql`
        insert into public.registrations (season_id, team_id, amount, requested_by)
        values (${request.season_id}, ${teamId}, ${data.amount ?? null}, ${context.userId})
      `),
    );
  }

  await closeSignup(context, request.id, {
    status: "approved",
    resolved_team_id: teamId,
  });
  revalidatePath("/admin/equipos");
  revalidatePath("/admin/inscripciones");
  done(SIGNUPS);
}

/** Aprueba a un jugador: crea el jugador y lo pone en el roster elegido. */
export async function approvePlayerRequest(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(approvePlayerSchema, formData, SIGNUPS);
  const request = await loadSignup(context, data.requestId);
  if (request.kind !== "player") fail(SIGNUPS, "Esta solicitud no es de jugador");
  if (request.resolved_player_id) fail(SIGNUPS, "El jugador ya fue creado");

  // Elegibilidad: no puede estar ya en un roster activo de esa división.
  const team = await run(SIGNUPS, () =>
    context.db.maybeOne<{ division_id: string }>(sql`
      select division_id from public.teams where id = ${data.teamId} limit 1
    `),
  );
  if (!team) fail(SIGNUPS, "Equipo inválido");

  const { firstName, lastName } = splitFullName(request.full_name);
  const created = await run(SIGNUPS, () =>
    context.db.one<{ id: string }>(sql`
      insert into public.players (organization_id, first_name, last_name)
      values (${context.organizationId}, ${firstName || request.full_name},
              ${lastName || ""})
      returning id
    `),
  );
  const playerId = created.id;

  await run(SIGNUPS, () =>
    context.db.exec(sql`
      insert into public.rosters (team_id, player_id, jersey_number, position)
      values (${data.teamId}, ${playerId}, ${data.jerseyNumber ?? null},
              ${data.position ?? null})
    `),
  );

  await closeSignup(context, request.id, {
    status: "approved",
    resolved_player_id: playerId,
  });
  revalidatePath("/admin/jugadores");
  done(SIGNUPS);
}

export async function markSignupContacted(id: string): Promise<void> {
  const context = await ctx();
  await closeSignup(context, id, { status: "contacted" });
  done(SIGNUPS);
}

export async function rejectSignup(id: string): Promise<void> {
  const context = await ctx();
  await closeSignup(context, id, { status: "rejected" });
  done(SIGNUPS);
}

export async function deleteSignup(id: string): Promise<void> {
  await deleteRow(await ctx(), "signup_requests", id, SIGNUPS);
}
