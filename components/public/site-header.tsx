import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";

const navLinkClass =
  "relative rounded-md px-3 py-2 text-muted-foreground transition-colors duration-200 after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:bg-brand-gradient after:transition-transform after:duration-200 hover:text-foreground hover:after:scale-x-100 motion-reduce:after:transition-none";

/**
 * Header público. En móvil es una barra compacta de una línea (solo el logo):
 * la navegación y la búsqueda viven en la barra de pestañas inferior, como en
 * una app. En pantallas ≥640px lleva navegación y búsqueda (form GET, 0 JS).
 */
export function SiteHeader() {
  return (
    // El ::before prolonga el fondo por encima del borde superior: en Safari de
    // iPhone la página se asoma bajo la barra de estado al hacer scroll.
    <header className="sticky top-0 z-30 border-b border-white/5 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-md select-none before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-32 before:bg-background before:content-['']">
      <div className="mx-auto flex h-12 w-full max-w-5xl items-center gap-x-5 px-4 sm:h-auto sm:py-3">
        <Link href="/" className="shrink-0 leading-none" aria-label="ALV SPORT — Inicio">
          <BrandLogo priority className="h-7 sm:h-8" />
        </Link>
        <nav
          aria-label="Principal"
          className="hidden items-center gap-1 text-[13px] font-medium tracking-[0.08em] uppercase sm:flex"
        >
          <Link href="/" className={navLinkClass}>
            Inicio
          </Link>
          <Link href="/tabla" className={navLinkClass}>
            Tabla
          </Link>
          <Link href="/estadisticas" className={navLinkClass}>
            Estadísticas
          </Link>
        </nav>
        <form action="/buscar" className="ml-auto hidden sm:block" role="search">
          <label htmlFor="buscar-global" className="sr-only">
            Buscar equipos, jugadores o partidos
          </label>
          <input
            id="buscar-global"
            type="search"
            name="q"
            placeholder="Buscar equipo, jugador…"
            enterKeyHint="search"
            className="h-11 w-64 min-w-0 rounded-full border border-brand-silver/20 bg-surface/80 px-4 text-sm outline-none transition-colors duration-200 placeholder:text-muted-foreground/60 focus-visible:border-brand-amber/60"
          />
        </form>
      </div>
      <div className="bg-brand-gradient h-px w-full opacity-60" aria-hidden />
    </header>
  );
}
