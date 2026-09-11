"use server";

import { redirect } from "next/navigation";
import { formDataToObject } from "@/lib/admin/schemas";
import { sql } from "@/lib/db";
import { hasDatabaseEnv } from "@/lib/db/pool";
import { getDb } from "@/lib/db/request";
import { signupSchema, teamJoinSchema } from "./schemas";

const BASE = "/inscribirse";

/**
 * `redirect()` de Next lanza una excepción con `digest`: no es un error real
 * y debe propagarse tal cual.
 */
function isControlFlow(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest: unknown }).digest === "string",
  );
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "No se pudo enviar el registro";
}

/**
 * Envío del auto-registro público. Sin sesión: corre con el rol `anon`, y la
 * escritura pasa SOLO por la función submit_signup_request (SECURITY
 * DEFINER, valida en Postgres). El honeypot finge éxito ante bots.
 */
export async function submitSignup(formData: FormData): Promise<void> {
  const raw = formDataToObject(formData);
  const tipo = typeof raw.kind === "string" ? raw.kind : "";

  // Honeypot: un humano nunca llena este campo oculto.
  if (typeof raw.website === "string" && raw.website.length > 0) {
    redirect(`${BASE}?ok=1`);
  }

  const result = signupSchema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Datos inválidos";
    redirect(`${BASE}?error=${encodeURIComponent(message)}&tipo=${tipo}`);
  }
  const data = result.data;

  if (!hasDatabaseEnv()) {
    redirect(
      `${BASE}?error=${encodeURIComponent("El registro no está disponible en modo demo")}&tipo=${tipo}`,
    );
  }

  try {
    const db = await getDb();
    await db.exec(sql`
      select public.submit_signup_request(
        ${data.seasonId}, ${data.kind}, ${data.fullName}, ${data.email},
        ${data.phone ?? null}, ${data.teamName ?? null}, ${data.teamColor ?? null},
        ${data.preferredTeamId ?? null}, ${data.position ?? null},
        ${data.jerseyNumber ?? null}, ${data.message ?? null}
      )
    `);
  } catch (error) {
    if (isControlFlow(error)) throw error;
    redirect(
      `${BASE}?error=${encodeURIComponent(errorMessage(error))}&tipo=${data.kind}`,
    );
  }
  redirect(`${BASE}?ok=1&tipo=${data.kind}`);
}

/**
 * Unión a un equipo vía link de invitación (el coach comparte /unirse/CODE).
 * Reusa la bandeja de solicitudes: entra como jugador ligado a ese equipo.
 */
export async function submitTeamJoin(formData: FormData): Promise<void> {
  const raw = formDataToObject(formData);
  const code = typeof raw.code === "string" ? raw.code : "";
  const base = `/unirse/${encodeURIComponent(code)}`;

  if (typeof raw.website === "string" && raw.website.length > 0) {
    redirect(`${base}?ok=1`);
  }

  const result = teamJoinSchema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Datos inválidos";
    redirect(`${base}?error=${encodeURIComponent(message)}`);
  }
  const data = result.data;

  if (!hasDatabaseEnv()) {
    redirect(`${base}?error=${encodeURIComponent("El registro no está disponible en modo demo")}`);
  }

  try {
    const db = await getDb();
    await db.exec(sql`
      select public.submit_team_join(
        ${data.code}, ${data.fullName}, ${data.email}, ${data.phone ?? null},
        ${data.position ?? null}, ${data.jerseyNumber ?? null},
        ${data.message ?? null}
      )
    `);
  } catch (error) {
    if (isControlFlow(error)) throw error;
    redirect(`${base}?error=${encodeURIComponent(errorMessage(error))}`);
  }
  redirect(`${base}?ok=1`);
}
