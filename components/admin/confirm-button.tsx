"use client";

/** Botón de acción destructiva con confirmación nativa (mínimo JS). */
export function ConfirmButton({
  children,
  message,
  ariaLabel,
}: {
  children: React.ReactNode;
  message: string;
  /** Para botones de solo ícono. */
  ariaLabel?: string;
}) {
  return (
    <button
      type="submit"
      aria-label={ariaLabel}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
      className="min-h-11 rounded-lg border border-destructive/40 px-3 text-sm text-destructive transition-colors hover:bg-destructive/10"
    >
      {children}
    </button>
  );
}
