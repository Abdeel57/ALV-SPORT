import Link from "next/link";

/** Header público: wordmark con swoosh, navegación y búsqueda (form GET, 0 JS). */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <Link
          href="/"
          className="font-display relative pb-1 text-2xl leading-none"
          aria-label="ALV SPORT — Inicio"
        >
          ALV <span className="text-brand-silver">Sport</span>
          <span
            aria-hidden
            className="bg-brand-gradient absolute bottom-0 left-0 h-[3px] w-14 -skew-x-[24deg]"
          />
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
            className="h-11 w-full min-w-0 rounded-full border border-brand-silver/20 bg-surface/80 px-4 text-sm outline-none transition-colors duration-200 placeholder:text-muted-foreground/60 focus-visible:border-brand-amber/60 sm:w-64"
          />
        </form>
      </div>
      <div className="bg-brand-gradient h-px w-full opacity-60" aria-hidden />
    </header>
  );
}
