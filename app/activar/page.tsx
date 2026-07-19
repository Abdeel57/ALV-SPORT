import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand/brand-logo";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Activar acceso" };
export const dynamic = "force-dynamic";

/**
 * Bootstrap de administrador (un solo uso). Convierte la cuenta con sesión
 * iniciada en `org_admin` de la primera organización, siempre que se presente
 * la clave secreta correcta (`ADMIN_BOOTSTRAP_SECRET`). Es la vía para dar de
 * alta al dueño de la liga sin tocar la base de datos a mano. Tras usarlo,
 * conviene retirar la variable de entorno para deshabilitarlo.
 */
async function claimAdmin(formData: FormData): Promise<void> {
  "use server";
  const key = String(formData.get("key") ?? "");
  const secret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!secret || key !== secret) redirect("/activar?e=key");

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = getSupabaseAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!org) redirect("/activar?e=org");

  const { error } = await admin.from("organization_members").upsert(
    {
      organization_id: (org as { id: string }).id,
      user_id: user.id,
      role: "org_admin",
    },
    { onConflict: "organization_id,user_id" },
  );
  if (error) redirect("/activar?e=db");
  redirect("/admin");
}

const errorMessages: Record<string, string> = {
  key: "La clave del enlace es inválida o falta. Revisa que abriste el enlace completo.",
  org: "No hay una organización configurada todavía. Aplica el seed primero.",
  db: "No se pudo activar el acceso. Intenta de nuevo en un momento.",
};

interface PageProps {
  searchParams: Promise<{ key?: string; e?: string }>;
}

export default async function ActivarPage({ searchParams }: PageProps) {
  const { key, e } = await searchParams;
  if (!hasSupabaseEnv()) redirect("/");

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <BrandLogo className="h-8" />
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card/60 p-6">
        <h1 className="font-display text-2xl">Activar administrador</h1>

        {e && errorMessages[e] && (
          <p className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessages[e]}
          </p>
        )}

        {!user ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Primero inicia sesión con la cuenta que quieres volver
              administrador; luego vuelve a abrir este mismo enlace.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
            >
              Iniciar sesión
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Sesión activa como{" "}
              <span className="text-foreground">{user.email}</span>. Confirma
              para convertir esta cuenta en administradora de la liga.
            </p>
            <form action={claimAdmin} className="mt-4">
              <input type="hidden" name="key" value={key ?? ""} />
              <button
                type="submit"
                className="min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/85 active:scale-[.99]"
              >
                Activar mi acceso de administrador
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
