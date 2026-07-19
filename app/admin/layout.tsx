import type { Metadata } from "next";
import Link from "next/link";
import {
  AdminBottomNav,
  AdminMobileTopBar,
  AdminSidebar,
} from "@/components/admin/admin-nav";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Card, CardContent } from "@/components/ui/card";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: { default: "Panel", template: "%s | ALV Admin" },
  // La sección /admin es una PWA aparte de la pública: enlaza su propio
  // manifest (app instalable independiente que abre directo en el panel) y su
  // identidad iOS con ícono e etiqueta propios.
  manifest: "/admin.webmanifest",
  appleWebApp: {
    capable: true,
    title: "ALV Panel",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icons/admin-icon-192.png", type: "image/png", sizes: "192x192" }],
    apple: "/icons/admin-apple-touch-icon.png",
  },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!hasSupabaseEnv()) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
        <BrandLogo className="h-8" />
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
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminMobileTopBar />
        {/* Aire para la barra inferior en móvil, sumando el área segura del
            dispositivo (barra de gestos / home indicator). */}
        <div className="flex-1 pb-[calc(6rem_+_env(safe-area-inset-bottom))] lg:pb-10">
          {children}
        </div>
      </div>
      <AdminBottomNav />
    </div>
  );
}
