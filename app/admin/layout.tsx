import type { Metadata } from "next";
import Link from "next/link";
import { AdminBottomNav, AdminSidebar } from "@/components/admin/admin-nav";
import { Card, CardContent } from "@/components/ui/card";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: { default: "Panel", template: "%s | ALV Admin" },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!hasSupabaseEnv()) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col gap-3 py-8 text-sm text-muted-foreground">
            <p className="font-display text-2xl text-foreground">Panel administrativo</p>
            <p>
              El panel muta datos reales, así que requiere un proyecto de
              Supabase configurado. Sigue el runbook del README (crear
              proyecto → <code>db push</code> → seed → credenciales en{" "}
              <code>.env.local</code>) y vuelve aquí.
            </p>
            <p>
              Mientras tanto puedes explorar el{" "}
              <Link href="/" className="text-brand-amber underline">
                sitio público
              </Link>{" "}
              y la{" "}
              <Link href="/anotador/demo" className="text-brand-amber underline">
                mesa de anotación demo
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <AdminSidebar />
      {/* pb-24 deja aire para la barra inferior en móvil */}
      <div className="min-w-0 flex-1 pb-24 lg:pb-8">{children}</div>
      <AdminBottomNav />
    </div>
  );
}
