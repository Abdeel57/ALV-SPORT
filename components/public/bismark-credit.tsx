import Image from "next/image";

/**
 * Crédito de desarrollo: "Sitio desarrollado por Bismark". Bloque centrado al
 * pie del sitio público. Usa el logo oficial de Bismark
 * (public/brand/bismark-logo.png); se invierte a blanco con `invert` para
 * contrastar sobre el footer oscuro sin depender de una segunda variante.
 */
export function BismarkCredit() {
  return (
    <section
      aria-label="Desarrollado por Bismark"
      className="border-t border-white/5"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-4 py-10 text-center">
        <div className="flex items-center gap-2.5 text-foreground">
          <Image
            src="/brand/bismark-logo.png"
            alt="Bismark"
            width={256}
            height={256}
            className="size-9 invert"
          />
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
