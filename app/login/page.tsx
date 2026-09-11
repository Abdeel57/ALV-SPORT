import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { BrandLogo } from "@/components/brand/brand-logo";
import { getSessionUser } from "@/lib/auth/session";
import { hasDatabaseEnv } from "@/lib/db/pool";

export const metadata: Metadata = { title: "Iniciar sesión" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const ready = hasDatabaseEnv();
  // Con sesión viva no tiene sentido volver a pedir credenciales.
  if (ready && (await getSessionUser())) redirect("/admin");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-7 px-4 py-10">
      <div className="flex flex-col items-center gap-2">
        <BrandLogo priority className="h-10" />
        <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
          El sistema operativo de tu liga
        </p>
      </div>

      <div className="card-elevated w-full max-w-sm overflow-hidden rounded-2xl">
        {/* Acento de marca: la barra de gradiente rojo → ámbar → plata. */}
        <div className="live-bar h-1 w-full" aria-hidden />

        <div className="p-6 sm:p-7">
          <div className="mb-5">
            <h1 className="font-display text-3xl leading-none">Iniciar sesión</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Accede al panel de administración de tu liga.
            </p>
          </div>

          {ready ? (
            <LoginForm />
          ) : (
            <div className="flex flex-col gap-3 text-sm text-muted-foreground">
              <p>
                La base de datos no está configurada. Copia <code>.env.example</code>{" "}
                a <code>.env.local</code> y llena <code>DATABASE_URL</code> y{" "}
                <code>AUTH_SECRET</code> (ver README), luego reinicia el servidor.
              </p>
              <p>
                Mientras tanto puedes probar la mesa de anotación sin cuenta en{" "}
                <Link href="/anotador/demo" className="text-brand-amber underline">
                  el modo demo
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground/70">ALV SPORT · All Leagues</p>
    </main>
  );
}
