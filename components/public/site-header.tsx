import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";

/** Header público: logo oficial, navegación y búsqueda (form GET, 0 JS). */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <Link
          href="/"
          className="shrink-0 leading-none"
          aria-label="ALV SPORT — Inicio"
        >
          <BrandLogo priority className="h-7 sm:h-8" />
        </Link>
        <nav
          aria-label="Principal"
          className="flex items-center gap-1 text-[13px] font-medium tracking-[0.08em] uppercase"
        >
          <Link
            href="/"
            className="relative rounded-md px-3 py-2 text-muted-foreground transition-colors duration-200 after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:bg-brand-gradient after:transition-transform after:duration-200 hover:text-foreground hover:after:scale-x-100 motion-reduce:after:transition-none"
          >
            Inicio
          </Link>
          <Link
            href="/tabla"
            className="relative rounded-md px-3 py-2 text-muted-foreground transition-colors duration-200 after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:bg-brand-gradient after:transition-transform after:duration-200 hover:text-foreground hover:after:scale-x-100 motion-reduce:after:transition-none"
          >
            Tabla
          </Link>
        </nav>
        <form action="/buscar" className="ml-auto w-full sm:w-auto" role="search">
          <label htmlFor="buscar-global" className="sr-only">
            Buscar equipos, jugadores o partidos
          </label>
          <input
            id="buscar-global"
            type="search"
            name="q"
            placeholder="Buscar equipo, jugador…"
            enterKeyHint="search"
            className="h-11 w-full min-w-0 rounded-full border border-brand-silver/20 bg-surface/80 px-4 text-base sm:text-sm outline-none transition-colors duration-200 placeholder:text-muted-foreground/60 focus-visible:border-brand-amber/60 sm:w-64"
          />
        </form>
      </div>
      <div className="bg-brand-gradient h-px w-full opacity-60" aria-hidden />
    </header>
  );
}
