"use server";

import { redirect } from "next/navigation";
import { formDataToObject } from "@/lib/admin/schemas";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { signupSchema, teamJoinSchema } from "./schemas";

const BASE = "/inscribirse";

/**
 * Envío del auto-registro público. Sin sesión: usa el cliente anon, y la
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

  if (!hasSupabaseEnv()) {
    redirect(
      `${BASE}?error=${encodeURIComponent("El registro no está disponible en modo demo")}&tipo=${tipo}`,
    );
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("submit_signup_request", {
    p_season: data.seasonId,
    p_kind: data.kind,
    p_full_name: data.fullName,
    p_email: data.email,
    p_phone: data.phone ?? null,
    p_team_name: data.teamName ?? null,
    p_team_color: data.teamColor ?? null,
    p_preferred_team: data.preferredTeamId ?? null,
    p_position: data.position ?? null,
    p_jersey: data.jerseyNumber ?? null,
    p_message: data.message ?? null,
  });
  if (error) {
    redirect(`${BASE}?error=${encodeURIComponent(error.message)}&tipo=${data.kind}`);
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

  if (!hasSupabaseEnv()) {
    redirect(`${base}?error=${encodeURIComponent("El registro no está disponible en modo demo")}`);
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("submit_team_join", {
    p_code: data.code,
    p_full_name: data.fullName,
    p_email: data.email,
    p_phone: data.phone ?? null,
    p_position: data.position ?? null,
    p_jersey: data.jerseyNumber ?? null,
    p_message: data.message ?? null,
  });
  if (error) {
    redirect(`${base}?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`${base}?ok=1`);
}
