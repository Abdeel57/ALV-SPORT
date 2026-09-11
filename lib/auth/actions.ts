"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { endSession, startSession } from "./session";
import { verifyCredentials } from "./users";
import { actorForUser, dbFor } from "@/lib/db/session";
import { sql } from "@/lib/db/sql";
import { hasDatabaseEnv } from "@/lib/db/pool";

/**
 * Inicio y cierre de sesión. Sustituye a GoTrue: la contraseña se verifica
 * dentro de Postgres y la sesión viaja en una cookie firmada por la app.
 */

export interface LoginState {
  error: string | null;
}

const credentials = z.object({
  email: z.string().trim().min(1, "Escribe tu correo").email("Correo inválido"),
  password: z.string().min(1, "Escribe tu contraseña"),
});

const GENERIC_ERROR = "Correo o contraseña incorrectos";

export async function signInAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!hasDatabaseEnv()) {
    return { error: "La base de datos no está configurada." };
  }

  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  let destination = "/anotador";
  try {
    const user = await verifyCredentials(parsed.data.email, parsed.data.password);
    // Mismo mensaje exista o no la cuenta: no revela qué correos están dados de alta.
    if (!user) return { error: GENERIC_ERROR };

    await startSession(user);

    // Enruta según rol: administradores al panel; el resto a la mesa de anotación.
    const membership = await dbFor(actorForUser(user.id)).maybeOne<{ role: string }>(sql`
      select role::text as role
        from public.organization_members
       where user_id = ${user.id}
       limit 1
    `);
    if (membership) destination = "/admin";
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "sign_in_failed",
        message: error instanceof Error ? error.message : "desconocido",
      }),
    );
    return { error: "No se pudo iniciar sesión. Intenta de nuevo." };
  }

  // Fuera del try: redirect() funciona lanzando una excepción de control.
  redirect(destination);
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
