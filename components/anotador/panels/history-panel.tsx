"use client";

import type { ScorebookStateInternal } from "@/lib/engine/scorebook";
import { PanelButton, SidePanel } from "../ui/side-panel";

/**
 * Historial de jugadas confirmadas, más reciente primero. Cada jugada se
 * puede anular (corrección con auditoría); el motor recalcula todo y avisa
 * si algo posterior quedó incoherente.
 */

export interface HistoryPanelProps {
  state: ScorebookStateInternal;
  canCorrect: boolean;
  pendingCorrection: string | null;
  onRequestCorrect: (playId: string) => void;
  onConfirmCorrect: () => void;
  onCancelCorrect: () => void;
  onClose: () => void;
}

export function HistoryPanel({ state, canCorrect, pendingCorrection, onRequestCorrect, onConfirmCorrect, onCancelCorrect, onClose }: HistoryPanelProps) {
  const plays = [...state.plays].reverse();
  return (
    <SidePanel title="Historial" subtitle={`${plays.length} jugada${plays.length === 1 ? "" : "s"} vigentes`} onClose={onClose} width="md">
      {plays.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--sheet-muted)" }}>
          Todavía no hay jugadas. Registra la primera con Bola/Strike/Foul, Out o Llegada a base.
        </p>
      ) : (
        <ol className="flex flex-col divide-y sheet-line" aria-label="Jugadas">
          {plays.map((play, index) => {
            const armed = pendingCorrection === play.playId;
            return (
              <li key={play.playId} className="flex flex-col gap-1.5 py-2">
                <div className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 shrink-0 rounded px-1.5 text-[10px] font-bold tabular-nums" style={{ backgroundColor: "var(--sheet-bg-alt)", color: "var(--sheet-muted)" }}>
                    {play.half === "top" ? "▲" : "▼"}{play.inning}
                  </span>
                  <span className="min-w-0 flex-1">
                    {play.text || "(sin descripción)"}
                    {play.partiallyVoided && (
                      <span className="ml-1 text-xs font-semibold" style={{ color: "var(--sheet-error)" }}>
                        · parcialmente anulada
                      </span>
                    )}
                  </span>
                  {index === 0 && (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>
                      última
                    </span>
                  )}
                </div>
                {canCorrect && (
                  armed ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-xs" style={{ borderColor: "var(--sheet-out)" }}>
                      <span className="font-semibold" style={{ color: "var(--sheet-out)" }}>¿Anular esta jugada?</span>
                      <PanelButton variant="danger" onClick={onConfirmCorrect} shortcut="Enter" className="min-h-9 px-3 text-xs">Sí, anular</PanelButton>
                      <PanelButton variant="secondary" onClick={onCancelCorrect} shortcut="Esc" className="min-h-9 px-3 text-xs">No</PanelButton>
                    </div>
                  ) : (
                    <button type="button" onClick={() => onRequestCorrect(play.playId)} className="self-start text-xs underline underline-offset-2" style={{ color: "var(--sheet-out)" }}>
                      Anular…
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ol>
      )}
    </SidePanel>
  );
}
