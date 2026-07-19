import Image from "next/image";
import type { PublicSponsor } from "@/lib/data/extras";

/** Franja de patrocinadores; no renderiza nada si no hay activos. */
export function SponsorStrip({ sponsors }: { sponsors: PublicSponsor[] }) {
  if (sponsors.length === 0) return null;
  return (
    <section aria-label="Patrocinadores" className="flex flex-col gap-2">
      <p className="text-xs tracking-widest text-muted-foreground uppercase">
        Patrocinadores
      </p>
      <ul className="flex flex-wrap items-center gap-3">
        {sponsors.map((sponsor) => {
          const content = sponsor.logoUrl ? (
            <Image
              src={sponsor.logoUrl}
              alt={sponsor.name}
              width={128}
              height={40}
              className="h-10 w-auto max-w-32 object-contain"
            />
          ) : (
            <span className="text-sm text-muted-foreground">{sponsor.name}</span>
          );
          return (
            <li
              key={sponsor.id}
              className="flex min-h-14 items-center rounded-lg border bg-card px-4"
            >
              {sponsor.linkUrl ? (
                <a href={sponsor.linkUrl} target="_blank" rel="noreferrer sponsored">
                  {content}
                </a>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
