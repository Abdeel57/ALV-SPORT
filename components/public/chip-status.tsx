"use client";

import { LoaderCircle } from "lucide-react";
import { useLinkStatus } from "next/link";

/**
 * Overlay de "cargando" para los chips de liga: `useLinkStatus` marca pending
 * desde el instante del toque, así el chip reacciona en 0 ms aunque la
 * navegación (render dinámico en el servidor) tarde. Vive dentro del <Link>
 * skewed, por eso el spinner se des-skewea para girar derecho.
 */
export function ChipPendingOverlay() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span className="absolute inset-0 grid place-items-center bg-background/70">
      <LoaderCircle
        className="size-4 skew-x-12 animate-spin text-brand-amber"
        aria-hidden
      />
    </span>
  );
}
