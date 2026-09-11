"use client";

import { cn } from "@/lib/utils";

/**
 * Barra de acciones de la mesa. Cada botón muestra su etiqueta y su atajo
 * (kbd). Lo frecuente (bola/strike/foul, out, llegada, corredores) va al
 * frente; lo demás (cambios, historial, reporte, ayuda) después.
 */

export interface ActionBarProps {
  disabled: boolean;
  canUndo: boolean;
  undoLabel: string | null;
  focusMode: boolean;
  shortcutsEnabled: boolean;
  pendingUndo: boolean;
  onPitch: (kind: "ball" | "strike" | "foul") => void;
  onOpenOuts: () => void;
  onOpenReach: () => void;
  onOpenRunners: () => void;
  onUndo: () => void;
  onOpenSubs: () => void;
  onOpenHistory: () => void;
  onOpenReport: () => void;
  onOpenHelp: () => void;
  onToggleFocus: () => void;
  onToggleShortcuts: () => void;
}

function Key({ children }: { children: string }) {
  return (
    <kbd
      className="ml-1.5 hidden rounded border px-1 font-mono text-[10px] leading-4 sm:inline-block"
      style={{ borderColor: "var(--sheet-line-strong)", color: "var(--sheet-muted)", backgroundColor: "var(--sheet-bg)" }}
      aria-hidden
    >
      {children}
    </kbd>
  );
}

function Action({
  label,
  shortLabel,
  shortcut,
  onClick,
  disabled,
  tone = "neutral",
  title,
}: {
  label: string;
  /** Etiqueta corta para pantallas angostas. */
  shortLabel?: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "out" | "hit" | "walk" | "warn";
  title?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "var(--sheet-ink)",
    out: "var(--sheet-out)",
    hit: "var(--sheet-hit)",
    walk: "var(--sheet-walk)",
    warn: "var(--sheet-error)",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? (shortcut ? `${label} (${shortcut})` : label)}
      aria-keyshortcuts={shortcut}
      className={cn(
        "inline-flex min-h-10 items-center justify-center rounded-lg border px-2.5 text-[13px] font-semibold transition-colors",
        "hover:bg-[var(--sheet-bg-alt)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sheet-select)]",
        "disabled:cursor-not-allowed disabled:opacity-45",
      )}
      style={{ borderColor: tone === "neutral" ? "var(--sheet-line-strong)" : tones[tone], color: tones[tone] }}
    >
      {shortLabel ? (
        <>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
      {shortcut && <Key>{shortcut}</Key>}
    </button>
  );
}

export function ActionBar(props: ActionBarProps) {
  const {
    disabled,
    canUndo,
    undoLabel,
    focusMode,
    shortcutsEnabled,
    pendingUndo,
    onPitch,
    onOpenOuts,
    onOpenReach,
    onOpenRunners,
    onUndo,
    onOpenSubs,
    onOpenHistory,
    onOpenReport,
    onOpenHelp,
    onToggleFocus,
    onToggleShortcuts,
  } = props;

  return (
    <nav aria-label="Acciones de anotación" className="sheet print-hide flex flex-wrap items-center gap-1.5 border-b px-2.5 py-1.5 sheet-line">
      <div className="flex items-center gap-1.5" role="group" aria-label="Lanzamiento">
        <Action label="Bola" shortcut="B" onClick={() => onPitch("ball")} disabled={disabled} tone="walk" />
        <Action label="Strike" shortcut="S" onClick={() => onPitch("strike")} disabled={disabled} tone="out" />
        <Action label="Foul" shortcut="F" onClick={() => onPitch("foul")} disabled={disabled} />
      </div>
      <span className="mx-1 hidden h-6 w-px sm:block" style={{ backgroundColor: "var(--sheet-line)" }} aria-hidden />
      <div className="flex items-center gap-1.5" role="group" aria-label="Jugada">
        <Action label="Out" shortcut="O" onClick={onOpenOuts} disabled={disabled} tone="out" />
        <Action label="Llegada a base" shortLabel="Base" shortcut="H" onClick={onOpenReach} disabled={disabled} tone="hit" />
        <Action label="Corredores" shortcut="R" onClick={onOpenRunners} disabled={disabled} />
      </div>
      <span className="mx-1 hidden h-6 w-px sm:block" style={{ backgroundColor: "var(--sheet-line)" }} aria-hidden />
      <div className="flex items-center gap-1.5 max-sm:w-full max-sm:overflow-x-auto max-sm:pb-0.5 sm:flex-wrap" role="group" aria-label="Herramientas">
        <Action
          label={pendingUndo ? "¿Deshacer? Enter" : "Deshacer"}
          shortcut="U"
          onClick={onUndo}
          disabled={disabled || !canUndo}
          tone={pendingUndo ? "warn" : "neutral"}
          title={undoLabel ? `Deshacer: ${undoLabel}` : "Nada que deshacer"}
        />
        <Action label="Cambios" shortcut="C" onClick={onOpenSubs} disabled={disabled} />
        <Action label="Historial" shortcut="I" onClick={onOpenHistory} />
        <Action label="Reporte" shortcut="T" onClick={onOpenReport} />
        <Action label="Ayuda" shortcut="?" onClick={onOpenHelp} />
        <span className="max-sm:hidden">
          <Action label={focusMode ? "Salir de enfoque" : "Enfoque"} shortcut="M" onClick={onToggleFocus} />
        </span>
        <label className="ml-1 inline-flex min-h-10 cursor-pointer items-center gap-2 text-xs max-sm:hidden" style={{ color: "var(--sheet-muted)" }}>
          <input type="checkbox" checked={shortcutsEnabled} onChange={onToggleShortcuts} className="size-4 accent-[var(--sheet-run)]" />
          Atajos
        </label>
      </div>
    </nav>
  );
}
