"use client";

import type { ConnectionStatus } from "@/lib/offline";

/**
 * Zona de estado discreta: guardado / pendiente / sin conexión / error,
 * última sincronización y acceso al historial. Nunca dice "guardado" si el
 * servidor no confirmó.
 */

export interface StatusBarProps {
  mode: "live" | "demo";
  status: ConnectionStatus;
  pendingCount: number;
  syncError: string | null;
  lastSyncedAt: string | null;
  issueCount: number;
  onOpenHistory: () => void;
  onOpenIssues: () => void;
}

const timeFormat = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function StatusBar({ mode, status, pendingCount, syncError, lastSyncedAt, issueCount, onOpenHistory, onOpenIssues }: StatusBarProps) {
  let label: string;
  let tone: string;
  if (mode === "demo") {
    label = `Modo demo · ${pendingCount} evento${pendingCount === 1 ? "" : "s"} en este navegador`;
    tone = "var(--sheet-muted)";
  } else if (status === "offline") {
    label = `Sin conexión · ${pendingCount} por enviar`;
    tone = "var(--sheet-out)";
  } else if (syncError && pendingCount > 0) {
    label = `Error al guardar (${syncError}) · reintentando`;
    tone = "var(--sheet-out)";
  } else if (pendingCount > 0) {
    label = `Guardando… ${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}`;
    tone = "var(--sheet-error)";
  } else {
    label = "Guardado";
    tone = "var(--sheet-hit)";
  }

  return (
    <footer
      className="sheet print-hide flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-1.5 text-xs sheet-line"
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-1.5 font-semibold" style={{ color: tone }}>
        <span className="inline-block size-2 rounded-full" style={{ backgroundColor: tone }} aria-hidden />
        {label}
      </span>
      {lastSyncedAt && mode === "live" && (
        <span style={{ color: "var(--sheet-muted)" }}>Última sincronización {timeFormat.format(new Date(lastSyncedAt))}</span>
      )}
      {issueCount > 0 && (
        <button type="button" onClick={onOpenIssues} className="font-semibold underline underline-offset-2" style={{ color: "var(--sheet-error)" }}>
          {issueCount} {issueCount === 1 ? "aviso por revisar" : "avisos por revisar"}
        </button>
      )}
      <button type="button" onClick={onOpenHistory} className="ml-auto underline underline-offset-2" style={{ color: "var(--sheet-muted)" }}>
        Ver historial
      </button>
    </footer>
  );
}
