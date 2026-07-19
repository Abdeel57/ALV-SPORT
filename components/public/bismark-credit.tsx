/**
 * Crédito de desarrollo: "Sitio desarrollado por Bismark". Bloque centrado al
 * pie del sitio público. El logo se dibuja en SVG (currentColor) para adaptarse
 * al tema y no depender de un asset externo.
 */

function BismarkMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="Bismark"
    >
      <rect
        x="2.5"
        y="2.5"
        width="27"
        height="27"
        rx="8"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <path
        d="M11.5 9.5 H18 a4.2 4.2 0 0 1 0 8.4 H11.5 V9.5 M11.5 17.9 V23"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BismarkCredit() {
  return (
    <section
      aria-label="Desarrollado por Bismark"
      className="border-t border-white/5"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-4 py-10 text-center">
        <div className="flex items-center gap-2.5 text-foreground">
          <BismarkMark className="size-7" />
          <span className="text-xl font-bold tracking-[0.18em] uppercase">
            Bismark
          </span>
        </div>

        <h2 className="text-lg font-bold text-foreground sm:text-xl">
          Sitio desarrollado por Bismark
        </h2>

        <p className="max-w-sm text-sm text-muted-foreground">
          ¿Quieres tu propia página como esta? Escríbenos.
        </p>

        <p className="text-[10px] font-medium tracking-[0.3em] text-muted-foreground/40 uppercase">
          Impulsado por Bismark
        </p>
      </div>
    </section>
  );
}
