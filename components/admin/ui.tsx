import { Badge } from "@/components/ui/badge";

/** Piezas compartidas del panel: consistentes, táctiles y es-MX. */

export function AdminTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h1 className="font-display text-3xl">{children}</h1>
      <div
        className="bg-brand-gradient h-0.5 min-w-6 flex-1 rounded-full opacity-40"
        style={{ clipPath: "polygon(0 0, 100% 0, calc(100% - 6px) 100%, 6px 100%)" }}
        aria-hidden
      />
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
        Cambios guardados.
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

export const inputClass =
  "min-h-12 w-full rounded-lg border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring";

export function SubmitButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="min-h-12 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
    >
      {children}
    </button>
  );
}

export function GhostButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="min-h-11 rounded-lg border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

const chipStyles: Record<string, string> = {
  pending: "border-brand-amber/50 text-brand-amber",
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
