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
  gameUpdateSchema,
  leagueSchema,
  newsSchema,
  playerSchema,
  registrationCreateSchema,
  rosterAssignSchema,
  sanctionSchema,
  scheduleConfigSchema,
  seasonSchema,
  sponsorSchema,
  teamSchema,
  venueSchema,
} from "./schemas";
import { assignSlots, generateRoundRobin } from "@/lib/engine";
import { approveCoachSchema, approvePlayerSchema } from "@/lib/signup/schemas";
import { slugify, splitFullName } from "@/lib/utils";

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

function parse<T>(
  schema: z.ZodType<T>,
  formData: FormData,
  path: string,
): T {
  const result = schema.safeParse(formDataToObject(formData));
  if (!result.success) fail(path, firstIssue(result.error));
  return result.data;
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function uploadImage(
  context: AdminContext,
  bucket: string,
  formData: FormData,
  field: string,
  path: string,
): Promise<string | null> {
  const file = formData.get(field);
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_IMAGE_BYTES) fail(path, "La imagen no debe exceder 4 MB");
  if (!file.type.startsWith("image/")) fail(path, "El archivo debe ser una imagen");
  const ext =
    (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") ||
    "png";
  const objectPath = `${context.organizationId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await context.supabase.storage
    .from(bucket)
    .upload(objectPath, file, { contentType: file.type });
  if (error) fail(path, `No se pudo subir la imagen: ${error.message}`);
  return context.supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
}

async function upsertRow(
  context: AdminContext,
  table: string,
  id: string | undefined,
  row: Record<string, unknown>,
  path: string,
): Promise<void> {
  const query = id
    ? context.supabase.from(table).update(row).eq("id", id)
    : context.supabase.from(table).insert(row);
  const { error } = await query;
  if (error) fail(path, error.message);
}

async function deleteRow(
  context: AdminContext,
  table: string,
  id: string,
  path: string,
): Promise<never> {
  const { error } = await context.supabase.from(table).delete().eq("id", id);
  if (error) fail(path, error.message);
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
    const row: Record<string, unknown> = { name: data.name, color: data.color };
    if (logoUrl) row.logo_url = logoUrl;
    await upsertRow(context, "leagues", data.id, row, LEAGUES);
    done(LEAGUES);
  }

  // Alta con asistente: liga → primera temporada → divisiones. La liga nace
  // OCULTA (is_published default false): se arma completa en privado y se
  // publica con el switch cuando está lista.
  const { data: inserted, error } = await context.supabase
    .from("leagues")
    .insert({
      organization_id: context.organizationId,
      sport_id: data.sportId,
      name: data.name,
      slug: slugify(data.name),
      color: data.color,
      logo_url: logoUrl,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    fail(
      LEAGUES,
      error?.code === "23505"
        ? "Ya existe una liga con un nombre muy similar; cambia el nombre"
        : (error?.message ?? "No se pudo crear la liga"),
    );
  }

  if (data.seasonName) {
    const { data: season, error: seasonError } = await context.supabase
      .from("seasons")
      .insert({
        league_id: (inserted as { id: string }).id,
        name: data.seasonName,
        status: "draft",
        starts_on: data.startsOn ?? null,
        ends_on: data.endsOn ?? null,
      })
      .select("id")
      .single();
    if (seasonError || !season) {
      fail(LEAGUES, `La liga se creó, pero la temporada falló: ${seasonError?.message ?? "error"}`);
    }
    const divisionNames = (data.divisions ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (divisionNames.length > 0) {
      const { error: divisionError } = await context.supabase.from("divisions").insert(
        divisionNames.map((name, index) => ({
          season_id: (season as { id: string }).id,
          name,
          sort_order: index,
        })),
      );
      if (divisionError) {
        fail(LEAGUES, `Liga y temporada creadas, pero las divisiones fallaron: ${divisionError.message}`);
      }
    }
  }
  done(LEAGUES);
}

export async function setLeaguePublished(id: string, publish: boolean): Promise<void> {
  const context = await ctx();
  const { error } = await context.supabase
    .from("leagues")
    .update({ is_published: publish })
    .eq("id", id);
  if (error) fail(LEAGUES, error.message);
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
  await upsertRow(context, "seasons", data.id, {
    league_id: data.leagueId,
    name: data.name,
    status: data.status,
    starts_on: data.startsOn ?? null,
    ends_on: data.endsOn ?? null,
  }, SEASONS);
  done(SEASONS);
}

export async function deleteSeason(id: string): Promise<void> {
  await deleteRow(await ctx(), "seasons", id, SEASONS);
}

export async function saveDivision(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(divisionSchema, formData, SEASONS);
  await upsertRow(context, "divisions", data.id, {
    season_id: data.seasonId,
    name: data.name,
    sort_order: data.sortOrder,
  }, SEASONS);
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
  await upsertRow(context, "venues", data.id, {
    organization_id: context.organizationId,
    name: data.name,
    address: data.address ?? null,
  }, VENUES);
  done(VENUES);
}

export async function deleteVenue(id: string): Promise<void> {
  await deleteRow(await ctx(), "venues", id, VENUES);
}

export async function saveCourt(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(courtSchema, formData, VENUES);
  await upsertRow(context, "courts", data.id, {
    venue_id: data.venueId,
    name: data.name,
  }, VENUES);
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
  const row: Record<string, unknown> = {
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
  const row: Record<string, unknown> = {
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
  const { data: teamRow } = await context.supabase
    .from("teams")
    .select("division_id")
    .eq("id", data.teamId)
    .single();
  const divisionId = (teamRow as { division_id: string } | null)?.division_id;
  if (!divisionId) fail(PLAYERS, "Equipo inválido");
  const { data: conflict } = await context.supabase
    .from("rosters")
    .select("id, teams!inner(division_id)")
    .eq("player_id", data.playerId)
    .eq("status", "active")
    .eq("teams.division_id", divisionId)
    .limit(1)
    .maybeSingle();
  if (conflict) {
    fail(PLAYERS, "El jugador ya está en un roster de esta división");
  }

  const { error } = await context.supabase.from("rosters").insert({
    team_id: data.teamId,
    player_id: data.playerId,
    jersey_number: data.jerseyNumber ?? null,
    position: data.position ?? null,
  });
  if (error) fail(PLAYERS, error.message);
  done(PLAYERS);
}

export async function removeFromRoster(id: string): Promise<void> {
  await deleteRow(await ctx(), "rosters", id, PLAYERS);
}

/* ------------------------------ Calendario ---------------------------- */

const SCHEDULE = "/admin/calendario";

export async function publishSchedule(formData: FormData): Promise<void> {
  const context = await ctx();
  const generatePath = "/admin/calendario/generar";
  const data = parse(scheduleConfigSchema, formData, generatePath);

  const { data: teamRows } = await context.supabase
    .from("teams")
    .select("id")
    .eq("division_id", data.divisionId);
  const teamIds = ((teamRows ?? []) as { id: string }[]).map((row) => row.id);
  if (teamIds.length < 2) fail(generatePath, "La división necesita al menos 2 equipos");

  const { data: divisionRow } = await context.supabase
    .from("divisions")
    .select("season_id")
    .eq("id", data.divisionId)
    .single();
  const seasonId = (divisionRow as { season_id: string } | null)?.season_id;
  if (!seasonId) fail(generatePath, "División inválida");

  const { data: courtRows } = await context.supabase
    .from("courts")
    .select("id, venue_id")
    .in("id", data.courtIds);
  const venueByCourt = new Map(
    ((courtRows ?? []) as { id: string; venue_id: string }[]).map((row) => [
      row.id,
      row.venue_id,
    ]),
  );

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

  const rows = fixtures.map((fixture) => ({
    season_id: seasonId,
    division_id: data.divisionId,
    home_team_id: fixture.homeTeamId,
    away_team_id: fixture.awayTeamId,
    court_id: fixture.courtId,
    venue_id: venueByCourt.get(fixture.courtId) ?? null,
    scheduled_at: fixture.scheduledAt,
    status: "scheduled",
  }));
  const { error } = await context.supabase.from("games").insert(rows);
  if (error) fail(generatePath, error.message);
  done(SCHEDULE);
}

export async function updateGame(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(gameUpdateSchema, formData, SCHEDULE);
  const { data: courtRow } = await context.supabase
    .from("courts")
    .select("venue_id")
    .eq("id", data.courtId)
    .single();
  const { error } = await context.supabase
    .from("games")
    .update({
      scheduled_at: new Date(data.scheduledAt).toISOString(),
      court_id: data.courtId,
      venue_id: (courtRow as { venue_id: string } | null)?.venue_id ?? null,
    })
    .eq("id", data.gameId);
  if (error) fail(SCHEDULE, error.message);
  done(SCHEDULE);
}

export async function deleteGame(id: string): Promise<void> {
  const context = await ctx();
  const { error } = await context.supabase
    .from("games")
    .delete()
    .eq("id", id)
    .eq("status", "scheduled");
  if (error) fail(SCHEDULE, error.message);
  done(SCHEDULE);
}

export async function assignOfficial(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(assignmentSchema, formData, SCHEDULE);
  const { data: userId, error: lookupError } = await context.supabase.rpc(
    "user_id_by_email",
    { p_email: data.email },
  );
  if (lookupError) fail(SCHEDULE, lookupError.message);
  if (!userId) {
    fail(SCHEDULE, `No existe un usuario con el correo ${data.email}. Pídele crear su cuenta primero.`);
  }
  const { error } = await context.supabase.from("game_assignments").insert({
    game_id: data.gameId,
    user_id: userId,
    role: data.role,
  });
  if (error) fail(SCHEDULE, error.message);
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
  const { error } = await context.supabase.from("registrations").insert({
    season_id: data.seasonId,
    team_id: data.teamId,
    amount: data.amount,
    requested_by: context.userId,
  });
  if (error) fail(REGISTRATIONS, error.message);
  done(REGISTRATIONS);
}

async function setRegistrationStatus(id: string, status: string): Promise<void> {
  const context = await ctx();
  const { error } = await context.supabase
    .from("registrations")
    .update({ status })
    .eq("id", id);
  if (error) fail(REGISTRATIONS, error.message);
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
  const { error } = await context.supabase
    .from("registrations")
    .update({
      status: "paid",
      payment_method: "cash",
      payment_ref: data.paymentRef ?? null,
      note: data.note,
    })
    .eq("id", data.registrationId);
  if (error) fail(REGISTRATIONS, error.message);
  done(REGISTRATIONS);
}

export async function createMpCheckout(id: string): Promise<void> {
  const context = await ctx();
  const { data } = await context.supabase
    .from("registrations")
    .select("id, amount, teams(name), seasons(name)")
    .eq("id", id)
    .single();
  const registration = data as unknown as {
    id: string;
    amount: number | null;
    teams: { name: string } | null;
    seasons: { name: string } | null;
  } | null;
  if (!registration?.amount) {
    fail(REGISTRATIONS, "La inscripción necesita un monto para generar el pago");
  }
  try {
    const link = await createMpPreference({
      registrationId: registration.id,
      title: `Inscripción ${registration.teams?.name ?? ""} · ${registration.seasons?.name ?? ""}`,
      amount: Number(registration.amount),
    });
    redirect(`${REGISTRATIONS}?mp_link=${encodeURIComponent(link)}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
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
  const { error } = await context.supabase.from("sanctions").insert({
    organization_id: context.organizationId,
    player_id: data.playerId,
    reason: data.reason,
    games_count: data.gamesCount,
    starts_on: data.startsOn,
    created_by: context.userId,
  });
  if (error) fail(SANCTIONS, error.message);
  done(SANCTIONS);
}

export async function cancelSanction(id: string): Promise<void> {
  const context = await ctx();
  const { error } = await context.supabase
    .from("sanctions")
    .update({ status: "canceled" })
    .eq("id", id);
  if (error) fail(SANCTIONS, error.message);
  done(SANCTIONS);
}

/* ------------------------- Noticias y sponsors ------------------------ */

const NEWS = "/admin/noticias";

export async function saveNews(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(newsSchema, formData, NEWS);
  const imageUrl = await uploadImage(context, "news-images", formData, "image", NEWS);
  const row: Record<string, unknown> = {
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
  const row: Record<string, unknown> = {
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

async function loadSignup(
  context: AdminContext,
  id: string,
): Promise<SignupRow> {
  const { data } = await context.supabase
    .from("signup_requests")
    .select("id, kind, status, season_id, full_name, team_name, resolved_team_id, resolved_player_id")
    .eq("id", id)
    .maybeSingle();
  const row = data as SignupRow | null;
  if (!row) fail(SIGNUPS, "La solicitud no existe");
  return row;
}

async function closeSignup(
  context: AdminContext,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await context.supabase
    .from("signup_requests")
    .update({ ...patch, reviewed_by: context.userId, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail(SIGNUPS, error.message);
}

/** Aprueba a un coach: crea su equipo y siembra la inscripción (pago). */
export async function approveCoachRequest(formData: FormData): Promise<void> {
  const context = await ctx();
  const data = parse(approveCoachSchema, formData, SIGNUPS);
  const request = await loadSignup(context, data.requestId);
  if (request.kind !== "coach") fail(SIGNUPS, "Esta solicitud no es de coach");
  if (request.resolved_team_id) fail(SIGNUPS, "El equipo ya fue creado");

  const { data: created, error: teamError } = await context.supabase
    .from("teams")
    .insert({
      organization_id: context.organizationId,
      division_id: data.divisionId,
      name: request.team_name ?? request.full_name,
      slug: data.slug,
      color: data.color,
    })
    .select("id")
    .single();
  if (teamError) fail(SIGNUPS, teamError.message);
  const teamId = (created as { id: string }).id;

  // Siembra la inscripción (queda pendiente de pago en /admin/inscripciones).
  if (request.season_id) {
    await context.supabase.from("registrations").insert({
      season_id: request.season_id,
      team_id: teamId,
      amount: data.amount ?? null,
      requested_by: context.userId,
    });
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
  const { data: teamRow } = await context.supabase
    .from("teams")
    .select("division_id")
    .eq("id", data.teamId)
    .single();
  const divisionId = (teamRow as { division_id: string } | null)?.division_id;
  if (!divisionId) fail(SIGNUPS, "Equipo inválido");

  const { firstName, lastName } = splitFullName(request.full_name);
  const { data: created, error: playerError } = await context.supabase
    .from("players")
    .insert({
      organization_id: context.organizationId,
      first_name: firstName || request.full_name,
      last_name: lastName || "",
    })
    .select("id")
    .single();
  if (playerError) fail(SIGNUPS, playerError.message);
  const playerId = (created as { id: string }).id;

  const { error: rosterError } = await context.supabase.from("rosters").insert({
    team_id: data.teamId,
    player_id: playerId,
    jersey_number: data.jerseyNumber ?? null,
    position: data.position ?? null,
  });
  if (rosterError) fail(SIGNUPS, rosterError.message);

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
