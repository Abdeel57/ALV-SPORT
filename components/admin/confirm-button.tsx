"use client";

/** Botón de acción destructiva con confirmación nativa (mínimo JS). */
export function ConfirmButton({
  children,
  message,
}: {
  children: React.ReactNode;
  message: string;
}) {
  return (
    <button
      type="submit"
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
      className="min-h-11 rounded-lg border border-destructive/40 px-3 text-sm text-destructive transition-colors hover:bg-destructive/10"
    >
      {children}
    </button>
  );
}
