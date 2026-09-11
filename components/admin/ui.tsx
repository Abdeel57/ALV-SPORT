import { ChevronDown, Plus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Piezas compartidas del panel. Reglas que aplican a todas las páginas:
 * título corto de una línea, una sola acción principal visible, listas
 * primero y formularios plegados, acciones de fila por icono con nombre
 * accesible, textos de ayuda de una línea o ninguno.
 */

/** Encabezado: título + conteo opcional; la acción principal nunca se corta. */
export function AdminTitle({
  children,
  subtitle,
  count,
  action,
  back,
}: {
  children: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Número visible junto al título (p. ej. equipos registrados). */
  count?: number;
  action?: React.ReactNode;
  /** Enlace de regreso (etiqueta y destino). */
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 pb-4">
      {back && (
        <Link href={back.href} className="-mb-1 self-start text-xs text-muted-foreground transition-colors hover:text-foreground">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-8 w-1 shrink-0 rounded-full bg-brand-gradient" aria-hidden />
          <div className="min-w-0">
            <h1 className="flex items-baseline gap-2 font-display text-2xl leading-none sm:text-3xl">
              <span className="truncate">{children}</span>
              {count !== undefined && (
                <span className="font-sans text-sm font-medium text-muted-foreground tabular-nums">{count}</span>
              )}
            </h1>
            {subtitle && <p className="mt-1 truncate text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{action}</div>}
      </div>
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
        Link de pago listo. Compártelo con el capitán:{" "}
        <a href={mpLink} className="break-all text-brand-amber underline" target="_blank" rel="noreferrer">
          {mpLink}
        </a>
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="rounded-lg border border-brand-silver/40 bg-secondary px-4 py-3 text-sm">
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
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5 text-sm", className)}>
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

/** Campo de archivo con botón propio en vez del control crudo del navegador. */
export const fileInputClass = cn(
  inputClass,
  "cursor-pointer py-2 text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground",
);

/** Selector de color compacto: muestra el color, no una barra gigante. */
export const colorInputClass =
  "size-12 cursor-pointer rounded-lg border bg-transparent p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-0";

export function SubmitButton({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <button
      type="submit"
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[.99]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <button
      type="submit"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Botón principal en forma de enlace (mismo aspecto que SubmitButton). */
export function PrimaryLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/85 active:scale-[.99]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Panel plegable para formularios: la lista se ve primero y el formulario
 * se abre al tocar el botón. Sin JavaScript (details/summary). Se abre solo
 * al editar (`open`).
 */
export function FormPanel({
  title,
  icon: Icon = Plus,
  open = false,
  tone = "primary",
  cancelHref,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  open?: boolean;
  /** primary = botón rojo (acción principal); ghost = secundario. */
  tone?: "primary" | "ghost";
  /** En edición: enlace que descarta los cambios y cierra el panel. */
  cancelHref?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details open={open} className={cn("group rounded-2xl border open:border-brand-amber/30 open:bg-card/40", className)}>
      <summary
        className={cn(
          "flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden",
          tone === "primary"
            ? "bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/85 group-open:rounded-b-none group-open:bg-transparent group-open:text-foreground group-open:shadow-none group-open:hover:bg-transparent"
            : "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground group-open:rounded-b-none group-open:text-foreground",
        )}
      >
        <Icon className="size-4 shrink-0 group-open:hidden" aria-hidden />
        <span className="truncate group-open:font-display group-open:text-base sm:group-open:text-lg">{title}</span>
        <ChevronDown className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-3 border-t border-border/60 px-4 pt-3 pb-4">
        {children}
        {cancelHref && (
          <Link href={cancelHref} className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline">
            Cancelar
          </Link>
        )}
      </div>
    </details>
  );
}

/** Acción de fila por icono: enlace con nombre accesible y tooltip. */
export function IconLink({
  href,
  label,
  icon: Icon,
  tone = "neutral",
  external,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  tone?: "neutral" | "amber";
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-lg border transition-colors hover:bg-muted",
        tone === "amber" ? "border-brand-amber/50 text-brand-amber" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </Link>
  );
}

/** Acción de fila por icono que envía un formulario (sin confirmación). */
export function IconSubmit({
  label,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  icon: LucideIcon;
  tone?: "neutral" | "amber";
}) {
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-lg border transition-colors hover:bg-muted",
        tone === "amber" ? "border-brand-amber/50 text-brand-amber" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

/** Fila estándar de lista: contenido flexible + acciones a la derecha. */
export function ListRow({ children, actions, className }: { children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 sm:px-4", className)}>
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">{children}</div>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
    </li>
  );
}

/** Título y subtítulo de una fila (dos líneas, truncadas). */
export function RowText({ title, meta, children }: { title: React.ReactNode; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <span className="truncate">{title}</span>
        {children}
      </span>
      {meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}
    </span>
  );
}

/** Encabezado de sección dentro de una página. */
export function SectionHeading({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h2 className="flex items-baseline gap-2 font-display text-lg">
      {children}
      {count !== undefined && <span className="font-sans text-xs font-medium text-muted-foreground tabular-nums">{count}</span>}
    </h2>
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
  hidden: "border-border text-muted-foreground",
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
  hidden: "Oculta",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("shrink-0", chipStyles[status] ?? "")}>
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
