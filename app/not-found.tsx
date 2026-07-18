import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <BrandLogo className="mb-2 h-7 opacity-90" />
      <p className="font-display text-8xl uppercase italic leading-none tracking-tight text-brand-silver/30 tabular-nums">
        404
      </p>
      <div className="h-1 w-24 rounded-full bg-brand-gradient" aria-hidden />
      <div>
        <h1 className="font-display text-3xl uppercase italic tracking-tight">
          Fuera de la zona
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          La página que buscas no existe o ya no está disponible. Revisa la
          dirección o vuelve al inicio.
        </p>
      </div>
      <Link
        href="/"
        className="flex min-h-12 items-center rounded-xl border border-brand-silver/25 px-6 text-sm font-medium hover:bg-muted"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
