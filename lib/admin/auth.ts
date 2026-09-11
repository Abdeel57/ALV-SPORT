import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasDatabaseEnv } from "@/lib/db/pool";
import { getDb } from "@/lib/db/request";
import { sql, type Db } from "@/lib/db";

export interface AdminContext {
  db: Db;
  userId: string;
  organizationId: string;
  role: "org_admin" | "season_manager";
}

/**
 * True si el usuario tiene rol org_admin/season_manager (sin redirigir).
 * La mesa de anotación lo usa para dejar anotar SIN asignación explícita —
 * la misma regla que ya aplican las políticas RLS de game_events.
 */
export async function isOrgManager(db: Db, userId: string): Promise<boolean> {
  const row = await db.maybeOne<{ role: string }>(sql`
    select role::text as role
      from public.organization_members
     where user_id = ${userId}
       and role in ('org_admin', 'season_manager')
     limit 1
  `);
  return Boolean(row);
}

/**
 * Guard del panel: requiere sesión y rol org_admin/season_manager. El RLS
 * de Postgres es la barrera real; esto evita renderizar el panel a quien
 * no corresponde. MVP: se administra la primera organización del usuario.
 */
export async function requireAdmin(): Promise<AdminContext | null> {
  if (!hasDatabaseEnv()) return null;

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const membership = await db.maybeOne<{
    organization_id: string;
    role: AdminContext["role"];
  }>(sql`
    select organization_id, role::text as role
      from public.organization_members
     where user_id = ${user.id}
       and role in ('org_admin', 'season_manager')
     limit 1
  `);
  if (!membership) redirect("/");

  return {
    db,
    userId: user.id,
    organizationId: membership.organization_id,
    role: membership.role,
  };
}
