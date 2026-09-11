import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand/brand-logo";
import { getSessionUser } from "@/lib/auth/session";
import { sql } from "@/lib/db";
import { hasDatabaseEnv } from "@/lib/db/pool";
import { serviceDb } from "@/lib/db/session";
import { SEED_ADMIN_USER_ID } from "@/lib/seed-data/ids";

export const metadata: Metadata = { title: "Activar acceso" };
export const dynamic = "force-dynamic";

/**
 * Alta del primer administrador ("first-run"). Convierte la cuenta con sesión
 * iniciada en `org_admin` de la primera organización, PERO solo mientras no
 * exista aún un administrador real (distinto del usuario semilla). En cuanto el
 * dueño reclama su acceso, la puerta se cierra sola: nadie más puede reclamarlo
 * desde aquí (los siguientes admins se agregan desde el panel).
 */
async function loadState(userId: string | null): Promise<{
  state: "anon" | "available" | "already" | "taken" | "no-org";
  organizationId: string | null;
}> {
  if (!userId) return { state: "anon", organizationId: null };

  const db = serviceDb();
  const org = await db.maybeOne<{ id: string }>(sql`
    select id from public.organizations order by created_at asc limit 1
  `);
  if (!org) return { state: "no-org", organizationId: null };

  const admins = await db.rows<{ user_id: string }>(sql`
    select user_id from public.organization_members
     where organization_id = ${org.id} and role = 'org_admin'
  `);
  const realAdmins = admins.filter((row) => row.user_id !== SEED_ADMIN_USER_ID);

  if (realAdmins.some((row) => row.user_id === userId)) {
    return { state: "already", organizationId: org.id };
  }
  if (realAdmins.length > 0) return { state: "taken", organizationId: org.id };
  return { state: "available", organizationId: org.id };
}

async function claimAdmin(): Promise<void> {
  "use server";
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { state, organizationId } = await loadState(user.id);
  if (state === "no-org") redirect("/activar?e=org");
  if (state === "taken") redirect("/activar?e=taken");
  if (state === "already" || !organizationId) redirect("/admin");

  try {
    await serviceDb().exec(sql`
      insert into public.organization_members (organization_id, user_id, role)
      values (${organizationId}, ${user.id}, 'org_admin')
      on conflict (organization_id, user_id) do update set role = 'org_admin'
    `);
  } catch {
    redirect("/activar?e=db");
  }
  redirect("/admin");
}

const errorMessages: Record<string, string> = {
  org: "Aún no hay una organización configurada (falta aplicar el seed).",
  taken: "Esta liga ya tiene un administrador. Pídele que te agregue desde el panel.",
  db: "No se pudo activar el acceso. Intenta de nuevo en un momento.",
};

interface PageProps {
  searchParams: Promise<{ e?: string }>;
}

export default async function ActivarPage({ searchParams }: PageProps) {
  const { e } = await searchParams;
  if (!hasDatabaseEnv()) redirect("/");

  const user = await getSessionUser();
  const { state } = await loadState(user?.id ?? null);

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

        {state === "anon" && (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Inicia sesión con la cuenta que quieres volver administradora y
              vuelve a abrir este enlace.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
            >
              Iniciar sesión
            </Link>
          </>
        )}

        {state === "available" && (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Sesión activa como{" "}
              <span className="text-foreground">{user?.email}</span>. Confirma
              para convertir esta cuenta en la administradora de la liga.
            </p>
            <form action={claimAdmin} className="mt-4">
              <button
                type="submit"
                className="min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/85 active:scale-[.99]"
              >
                Activar mi acceso de administrador
              </button>
            </form>
          </>
        )}

        {state === "already" && (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="text-foreground">{user?.email}</span> ya es
              administrador. Entra al panel.
            </p>
            <Link
              href="/admin"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
            >
              Ir al panel
            </Link>
          </>
        )}

        {(state === "taken" || state === "no-org") && (
          <p className="mt-2 text-sm text-muted-foreground">
            {state === "taken"
              ? "Esta liga ya tiene un administrador. Pídele que te agregue desde el panel."
              : "Aún no hay una organización configurada."}
          </p>
        )}
      </div>
    </main>
  );
}
