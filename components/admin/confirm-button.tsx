"use client";

import { cn } from "@/lib/utils";

/**
 * Botón de acción destructiva con confirmación nativa (mínimo JS). Con
 * `icon` se dibuja cuadrado de 44 px para las acciones de fila; el nombre
 * accesible va en `ariaLabel` y como tooltip.
 */
export function ConfirmButton({
  children,
  message,
  ariaLabel,
  icon = false,
  className,
}: {
  children: React.ReactNode;
  message: string;
  /** Para botones de solo ícono. */
  ariaLabel?: string;
  icon?: boolean;
  className?: string;
}) {
  return (
    <button
      type="submit"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
      className={cn(
        "rounded-lg border border-destructive/40 text-sm text-destructive transition-colors hover:bg-destructive/10",
        icon ? "grid size-11 shrink-0 place-items-center" : "min-h-11 px-3",
        className,
      )}
    >
      {children}
    </button>
  );
}
