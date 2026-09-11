import Image from "next/image";
import type { PublicSponsor } from "@/lib/data/extras";

/**
 * "Presenta:" con el logo del patrocinador principal, para la marquesina
 * del marcador. Es solo el logo (sin enlace) porque la marquesina de
 * portada ya es un enlace al partido.
 */
export function SponsorPresenter({ sponsor }: { sponsor: PublicSponsor }) {
  return (
    <span
      className="flex min-w-0 items-center justify-center gap-2"
      title={`Presenta: ${sponsor.name}`}
    >
      <span className="shrink-0 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        Presenta
      </span>
      {sponsor.logoUrl ? (
        <Image
          src={sponsor.logoUrl}
          alt={sponsor.name}
          width={200}
          height={56}
          className="logo-glow h-6 w-auto max-w-28 object-contain sm:h-7 sm:max-w-36"
        />
      ) : (
        <span className="font-display truncate text-sm sm:text-base">{sponsor.name}</span>
      )}
    </span>
  );
}
