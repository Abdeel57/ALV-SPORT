"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      const { error: authError } = await supabase.auth.signInWithPassword({
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
      router.push("/anotador");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo iniciar sesión",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-display text-3xl">Iniciar sesión</CardTitle>
        </CardHeader>
        <CardContent>
          {!envReady ? (
            <div className="flex flex-col gap-3 text-sm text-muted-foreground">
              <p>
                Supabase no está configurado. Copia <code>.env.example</code> a{" "}
                <code>.env.local</code> con las credenciales de tu proyecto
                (ver README) y reinicia el servidor.
              </p>
              <p>
                Mientras tanto puedes probar la mesa de anotación sin cuenta en{" "}
                <Link href="/anotador/demo" className="text-brand-amber underline">
                  el modo demo
                </Link>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Correo
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-h-11 rounded-lg border bg-transparent px-3 outline-none focus-visible:border-ring"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Contraseña
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-h-11 rounded-lg border bg-transparent px-3 outline-none focus-visible:border-ring"
                />
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="min-h-11" disabled={busy}>
                {busy ? "Entrando…" : "Entrar"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
