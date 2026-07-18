"use client";

import { useEffect } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // Reporta el error al servidor para que quede en los logs con contexto.
    try {
      const body = JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
      });
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        navigator.sendBeacon("/api/telemetry", body);
      } else {
        void fetch("/api/telemetry", { method: "POST", body, keepalive: true });
      }
    } catch {
      // El reporte nunca debe romper la página de error.
    }
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <BrandLogo className="mb-2 h-7 opacity-90" />
      <p className="font-display text-6xl uppercase italic leading-none tracking-tight text-destructive/60">
        Falta técnica
      </p>
      <div className="h-1 w-24 rounded-full bg-brand-gradient" aria-hidden />
      <div>
        <h1 className="font-display text-2xl uppercase italic tracking-tight">
          Algo salió mal
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Ocurrió un error inesperado. Puedes reintentar; si el problema
          persiste, avisa al administrador de tu liga.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground/60">
            Referencia: {error.digest}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={reset}
        className="flex min-h-12 items-center rounded-xl border border-brand-silver/25 px-6 text-sm font-medium hover:bg-muted"
      >
        Reintentar
      </button>
    </main>
  );
}
