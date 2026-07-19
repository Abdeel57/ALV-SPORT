"use client";

import { Eye, EyeOff, LoaderCircle, Lock, Mail, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const envReady = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });
      if (authError) {
        throw new Error(
          authError.message === "Invalid login credentials"
            ? "Correo o contraseña incorrectos"
            : authError.message,
        );
      }
      // Enruta según rol: administradores al panel; el resto a la mesa de anotación.
      let destination = "/anotador";
      const userId = authData.user?.id;
      if (userId) {
        const { data: membership } = await supabase
          .from("organization_members")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle();
        if (membership) destination = "/admin";
      }
      router.push(destination);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo iniciar sesión",
      );
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "min-h-11 w-full rounded-lg border border-input bg-background/40 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-60";
  const iconClass =
    "pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground";
  const labelClass =
    "text-xs font-medium tracking-wide text-muted-foreground uppercase";

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
            <h1 className="font-display text-3xl leading-none">
              Iniciar sesión
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Accede al panel de administración de tu liga.
            </p>
          </div>

          {!envReady ? (
            <div className="flex flex-col gap-3 text-sm text-muted-foreground">
              <p>
                Supabase no está configurado. Copia <code>.env.example</code> a{" "}
                <code>.env.local</code> con las credenciales de tu proyecto
                (ver README) y reinicia el servidor.
              </p>
              <p>
                Mientras tanto puedes probar la mesa de anotación sin cuenta en{" "}
                <Link
                  href="/anotador/demo"
                  className="text-brand-amber underline"
                >
                  el modo demo
                </Link>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="stagger flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className={labelClass}>
                  Correo
                </label>
                <div className="relative">
                  <Mail className={iconClass} aria-hidden />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="email"
                    placeholder="tucorreo@ejemplo.com"
                    disabled={busy}
                    aria-invalid={Boolean(error)}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${fieldClass} pl-10`}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className={labelClass}>
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className={iconClass} aria-hidden />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    disabled={busy}
                    aria-invalid={Boolean(error)}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${fieldClass} pr-11 pl-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={busy}
                    aria-label={
                      showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                    className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                </p>
              )}

              <Button
                type="submit"
                className="sheen mt-1 min-h-11 w-full font-medium"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                    Entrando…
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground/70">
        ALV SPORT · All Leagues
      </p>
    </main>
  );
}
