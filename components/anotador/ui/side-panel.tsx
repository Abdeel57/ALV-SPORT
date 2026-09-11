"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Panel lateral único de captura y consulta: en escritorio es una hoja a la
 * derecha; en móvil ocupa la pantalla desde abajo. Nunca se apilan dos:
 * quien lo abre cierra el anterior. Esc lo cierra (lo maneja el padre).
 */

export interface SidePanelProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  width?: "md" | "lg" | "xl";
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Id del elemento que describe el panel (para aria-describedby). */
  describedBy?: string;
  /** El reporte se imprime; los demás paneles se ocultan al imprimir. */
  printable?: boolean;
}

export function SidePanel({ title, subtitle, onClose, width = "md", children, footer, describedBy, printable }: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = `panel-${title.replace(/\s+/g, "-").toLowerCase()}`;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>("[data-autofocus], button:not([disabled]), input, select, textarea");
    (first ?? panel).focus();
  }, []);

  return (
    <div className={cn("fixed inset-0 z-40 flex justify-end", printable ? "print-static" : "print-hide")} role="presentation">
      <button type="button" aria-label="Cerrar panel" onClick={onClose} className="print-hide absolute inset-0 bg-black/45 backdrop-blur-[1px]" tabIndex={-1} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cn(
          "sheet relative flex h-full max-h-dvh w-full flex-col shadow-2xl outline-none",
          "max-sm:mt-10 max-sm:rounded-t-2xl",
          width === "md" && "sm:w-[440px]",
          width === "lg" && "sm:w-[560px]",
          width === "xl" && "sm:w-[720px]",
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3 sheet-line">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-xl leading-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs" style={{ color: "var(--sheet-muted)" }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="print-hide grid size-9 shrink-0 place-items-center rounded-md border text-sm hover:bg-[var(--sheet-bg-alt)]"
            style={{ borderColor: "var(--sheet-line-strong)" }}
          >
            ✕<span className="sr-only"> (Esc)</span>
          </button>
        </header>
        <div className="print-flow min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <footer className="border-t px-4 py-3 sheet-line">{footer}</footer>}
      </div>
    </div>
  );
}

export function PanelButton({
  children,
  onClick,
  variant = "secondary",
  disabled,
  shortcut,
  className,
  type = "button",
  autoFocus,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  shortcut?: string;
  className?: string;
  type?: "button" | "submit";
  autoFocus?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: "var(--sheet-ink)", color: "var(--sheet-bg)", borderColor: "var(--sheet-ink)" },
    secondary: { backgroundColor: "transparent", color: "var(--sheet-ink)", borderColor: "var(--sheet-line-strong)" },
    danger: { backgroundColor: "transparent", color: "var(--sheet-out)", borderColor: "var(--sheet-out)" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-autofocus={autoFocus ? "" : undefined}
      aria-keyshortcuts={shortcut}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sheet-select)] disabled:cursor-not-allowed disabled:opacity-45",
        variant === "secondary" && "hover:bg-[var(--sheet-bg-alt)]",
        className,
      )}
      style={styles[variant]}
    >
      {children}
      {shortcut && (
        <kbd className="rounded border px-1 font-mono text-[10px] leading-4 opacity-80" style={{ borderColor: "currentColor" }} aria-hidden>
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
