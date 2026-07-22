import { Badge } from "@/components/ui/badge";

/** Piezas compartidas del panel: consistentes, táctiles y es-MX. */

/**
 * Encabezado de página del panel: acento vertical de marca + título, con
 * subtítulo y acción opcionales alineados a la derecha. Cierra con una
 * hairline sutil para separarlo del contenido.
 */
export function AdminTitle({
  children,
  subtitle,
  action,
}: {
  children: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-border/60 pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="h-9 w-1 shrink-0 rounded-full bg-brand-gradient" aria-hidden />
        <div className="min-w-0">
          <h1 className="font-display text-3xl leading-none">{children}</h1>
          {subtitle && (
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/** Banner de resultado leído de searchParams (?ok=1 / ?error=... / ?mp_link=...). */
export function Feedback({
  ok,
  error,
  mpLink,
}: {
  ok?: string;
  error?: string;
  mpLink?: string;
}) {
  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (mpLink) {
    return (
      <p className="rounded-lg border border-brand-amber/50 bg-brand-amber/10 px-4 py-3 text-sm">
        Link de pago generado — compártelo con el capitán:{" "}
        <a href={mpLink} className="break-all text-brand-amber underline" target="_blank" rel="noreferrer">
          {mpLink}
        </a>
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="rounded-lg border border-brand-silver/40 bg-secondary px-4 py-3 text-sm">
        {/* ok=1 es el genérico; cualquier otro texto es un resumen específico. */}
        {ok === "1" ? "Cambios guardados." : ok}
      </p>
    );
  }
  return null;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

// text-base en móvil evita el zoom de iOS al enfocar; sm:text-sm recupera la
// escala del diseño en pantallas ≥640px.
export const inputClass =
  "min-h-12 w-full rounded-lg border bg-surface/40 px-3 text-base sm:text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export function SubmitButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[.99]"
    >
      {children}
    </button>
  );
}

export function GhostButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

const chipStyles: Record<string, string> = {
  pending: "border-brand-amber/50 text-brand-amber",
  contacted: "border-primary/40 text-primary",
  approved: "border-brand-silver/50 text-brand-silver",
  paid: "border-primary/50 text-primary",
  rejected: "border-border text-muted-foreground",
  active: "border-primary/50 text-primary",
  served: "border-border text-muted-foreground",
  canceled: "border-border text-muted-foreground",
  draft: "border-brand-amber/50 text-brand-amber",
  published: "border-brand-silver/50 text-brand-silver",
  scheduled: "border-border text-muted-foreground",
  in_progress: "border-primary/60 text-primary",
  finalized: "border-brand-silver/40 text-brand-silver",
};

const chipLabels: Record<string, string> = {
  pending: "Pendiente",
  contacted: "Contactado",
  approved: "Aprobada",
  paid: "Pagado",
  rejected: "Rechazada",
  active: "Activa",
  served: "Cumplida",
  canceled: "Cancelada",
  draft: "Borrador",
  published: "Publicada",
  scheduled: "Programado",
  in_progress: "EN VIVO",
  finalized: "Final",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={chipStyles[status] ?? ""}>
      {chipLabels[status] ?? status}
    </Badge>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
