import Image from "next/image";
import type { PublicSponsor } from "@/lib/data/extras";

/**
 * Patrocinadores del pie: tiles del mismo tamaño en una fila que se
 * desplaza en móvil y se acomoda en varias líneas en pantallas anchas.
 * No renderiza nada si no hay activos.
 */
export function SponsorStrip({ sponsors }: { sponsors: PublicSponsor[] }) {
  if (sponsors.length === 0) return null;
  const tileClass =
    "flex h-20 w-40 items-center justify-center rounded-xl border border-brand-silver/15 bg-card px-4 transition-colors hover:border-brand-silver/40";
  return (
    <section aria-label="Patrocinadores" className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        Patrocinadores
      </p>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
        {sponsors.map((sponsor) => {
          const content = sponsor.logoUrl ? (
            <Image
              src={sponsor.logoUrl}
              alt={sponsor.name}
              width={256}
              height={96}
              className="logo-glow max-h-12 w-auto max-w-32 object-contain"
            />
          ) : (
            <span className="font-display line-clamp-2 text-center text-base leading-tight">
              {sponsor.name}
            </span>
          );
          return (
            <li key={sponsor.id} className="shrink-0">
              {sponsor.linkUrl ? (
                <a
                  href={sponsor.linkUrl}
                  target="_blank"
                  rel="noreferrer sponsored"
                  title={sponsor.name}
                  className={tileClass}
                >
                  {content}
                </a>
              ) : (
                <div title={sponsor.name} className={tileClass}>
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
