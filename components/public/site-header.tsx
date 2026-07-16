import Link from "next/link";

/** Header público: wordmark, navegación y búsqueda global (form GET, 0 JS). */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="font-display text-2xl" aria-label="ALV SPORT — Inicio">
          ALV <span className="text-brand-silver">Sport</span>
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-1 text-sm">
          <Link
            href="/"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Inicio
          </Link>
          <Link
            href="/tabla"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
            className="h-11 w-full min-w-0 rounded-lg border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring sm:w-64"
          />
        </form>
      </div>
      <div className="bg-brand-gradient h-px w-full opacity-60" aria-hidden />
    </header>
  );
}
