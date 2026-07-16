import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface AdminContext {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  userId: string;
  organizationId: string;
  role: "org_admin" | "season_manager";
}

/**
 * Guard del panel: requiere sesión y rol org_admin/season_manager. El RLS
 * de Postgres es la barrera real; esto evita renderizar el panel a quien
 * no corresponde. MVP: se administra la primera organización del usuario.
 */
export async function requireAdmin(): Promise<AdminContext | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .in("role", ["org_admin", "season_manager"])
    .limit(1)
    .maybeSingle();
  const membership = data as { organization_id: string; role: AdminContext["role"] } | null;
  if (!membership) redirect("/");

  return {
    supabase,
    userId: user.id,
    organizationId: membership.organization_id,
    role: membership.role,
  };
}
