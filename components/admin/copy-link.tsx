"use client";

import { useState } from "react";

/** Muestra un link y un botón para copiarlo al portapapeles. */
export function CopyLink({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sin permiso de portapapeles: el usuario puede seleccionar y copiar.
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/50 px-3 py-2 text-xs">
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          className="min-h-9 shrink-0 rounded-lg border border-brand-amber/50 px-3 text-xs font-semibold text-brand-amber transition-colors hover:bg-brand-amber/10"
        >
          {copied ? "¡Copiado!" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
