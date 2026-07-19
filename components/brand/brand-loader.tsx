import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Pantalla de carga de marca, estilo broadcast: el wordmark oficial sobre un
 * halo rojo/ámbar que respira, un destello que recorre las letras (el propio
 * wordmark actúa como máscara, ver `loader-sheen` en globals.css) y una barra
 * indeterminada con el gradiente de marca.
 *
 * El arte (`/brand/pantalla-carga.webp`, wordmark compacto con alpha derivado
 * por `scripts/generate-brand-assets.ts`) se precarga desde el layout raíz,
 * así que pinta al instante. Aparece con un retraso de 150 ms para que las
 * navegaciones rápidas no lo "flasheen".
 *
 * Se usa en los `loading.tsx` de rutas SIN skeleton propio (entrada a la
 * app, /admin); las vistas públicas de contenido conservan sus skeletons,
 * que comunican mejor la estructura de lo que viene.
 */

// Dimensiones intrínsecas del webp (evita layout shift).
const INTRINSIC_WIDTH = 640;
const INTRINSIC_HEIGHT = 207;

export function BrandLoader({
  variant = "pantalla",
  label = "Cargando…",
  className,
}: {
  /**
   * `pantalla`: ocupa el viewport completo (entrada a la app, rutas sin
   * shell). `seccion`: dentro de un shell persistente (contenido del admin).
   */
  variant?: "pantalla" | "seccion";
  label?: string;
  className?: string;
}) {
  const seccion = variant === "seccion";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "loader-appear flex flex-col items-center justify-center overflow-hidden",
        seccion ? "min-h-[60dvh]" : "min-h-dvh",
        className,
      )}
    >
      <div className="relative">
        <div
          aria-hidden
          className="loader-halo absolute -inset-x-14 -inset-y-16 sm:-inset-x-20 sm:-inset-y-24"
        />
        <Image
          src="/brand/pantalla-carga.webp"
          alt=""
          width={INTRINSIC_WIDTH}
          height={INTRINSIC_HEIGHT}
          priority
          // Ya está optimizado y precargado como archivo estático; pasar por
          // /_next/image cambiaría la URL y rompería esa caché compartida.
          unoptimized
          className={cn(
            "relative w-64 select-none sm:w-80",
            seccion && "w-52 sm:w-64",
          )}
        />
        <div aria-hidden className="loader-sheen absolute inset-0" />
      </div>
      <div
        className={cn(
          "loader-track relative mt-9 h-1 w-44 overflow-hidden rounded-full",
          seccion && "mt-7 w-36",
        )}
      >
        <div className="loader-thumb h-full w-2/5 rounded-full" />
      </div>
      <p className="mt-4 text-[11px] font-medium tracking-[0.3em] text-muted-foreground uppercase">
        {label}
      </p>
    </div>
  );
}
