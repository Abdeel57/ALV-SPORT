import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";

export const metadata: Metadata = {
  title: "Sin conexión",
  robots: { index: false, follow: false },
};

/**
 * Fallback offline de la PWA (precacheado por Serwist). Se muestra cuando una
 * navegación falla sin red y no hay copia en caché. Mantiene la identidad ALV.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="bg-brand-gradient h-1 w-24 rounded-full opacity-80" aria-hidden />
      <BrandLogo className="h-9" />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl">Estás sin conexión</h1>
        <p className="text-sm text-muted-foreground">
          No pudimos cargar esta página. Revisa tu internet — los marcadores y
          la tabla vuelven en cuanto recuperes la señal.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
      >
        Reintentar
      </Link>
    </main>
  );
}
