import { cn } from "@/lib/utils";

/**
 * Escudo de equipo: muestra el logo subido (Storage) y, si no hay, cae a un
 * monograma con la inicial teñido por el color oficial del equipo. El tamaño y
 * el tamaño de texto vienen por `className` para reusarlo en hero, tarjetas y
 * marcador (server-safe: sin hooks, sirve en componentes cliente y servidor).
 */
export function TeamBadge({
  name,
  color,
  logoUrl,
  className,
  glow = false,
}: {
  name: string;
  color: string | null;
  logoUrl?: string | null;
  className?: string;
  glow?: boolean;
}) {
  const tint = color ?? "#666";
  const ring = {
    borderColor: `${tint}66`,
    ...(glow ? { boxShadow: `0 0 26px ${tint}33` } : {}),
  };
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className={cn("shrink-0 rounded-full border bg-white/5 object-cover", className)}
        style={ring}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "font-display grid shrink-0 place-items-center rounded-full border leading-none",
        className,
      )}
      style={{ ...ring, backgroundColor: `${tint}24` }}
    >
      {name.slice(0, 1)}
    </span>
  );
}
