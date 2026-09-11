import Image from "next/image";

/**
 * Crédito de desarrollo en una sola línea discreta al pie: el protagonismo
 * del pie es de la liga, no del desarrollador.
 */
export function BismarkCredit() {
  return (
    <section aria-label="Desarrollado por Bismark" className="border-t border-white/5">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-4 text-center text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 text-foreground">
          <Image src="/brand/bismark-logo.png" alt="" width={256} height={256} className="size-5 invert" />
          <span className="font-semibold tracking-[0.14em] uppercase">Bismark</span>
        </span>
        <span>Sitio desarrollado por Bismark · ¿Quieres tu propia página? Escríbenos.</span>
      </div>
    </section>
  );
}
