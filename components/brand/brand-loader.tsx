import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Pantalla de carga de marca, estilo broadcast: el logo del render oficial
 * ("ICONO DE PANTALLA DE CARGA.png", extraído sin su glow de fondo) sobre
 * fondo limpio, un destello que recorre las letras (el propio arte actúa
 * como máscara, ver `loader-sheen` en globals.css) y una barra indeterminada
 * con el gradiente de marca.
 *
 * El arte (`/brand/pantalla-carga.webp`, derivado por
 * `scripts/generate-brand-assets.ts`) se precarga desde el layout raíz, así
 * que pinta al instante. Aparece con un retraso de 150 ms para que las
 * navegaciones rápidas no lo "flasheen".
 *
 * Se usa en todos los `loading.tsx`: raíz (viewport completo) y dentro de
 * los shells público y de admin (variante `seccion`, el nav queda fijo).
 */

// Dimensiones intrínsecas del webp (evita layout shift).
const INTRINSIC_WIDTH = 640;
const INTRINSIC_HEIGHT = 288;

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
