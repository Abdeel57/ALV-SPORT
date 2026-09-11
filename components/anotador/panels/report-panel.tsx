"use client";

import { useMemo, useState } from "react";
import {
  battingLines,
  fieldingLines,
  pitchingLines,
  teamBattingTotals,
  teamRuns,
  type BattingLine,
  type PitchingLine,
  type ScorebookStateInternal,
} from "@/lib/engine/scorebook";
import { cn } from "@/lib/utils";
import { PanelButton, SidePanel } from "../ui/side-panel";
import type { ConsoleGame, ConsoleTeam } from "../types";

/**
 * Reporte del partido: box score de bateo, pitcheo y defensa, derivado de la
 * libreta. Exporta a CSV e imprime. Aquí también se finaliza el partido
 * (con revisión) o se cierra una media entrada por tope/tiempo.
 */

export interface ReportPanelProps {
  state: ScorebookStateInternal;
  homeTeam: ConsoleTeam;
  awayTeam: ConsoleTeam;
  game: ConsoleGame;
  playerNames: Record<string, string>;
  jerseyOf: (playerId: string) => string | null;
  phase: "scoring" | "finished";
  canFinalize: boolean;
  busy: boolean;
  error: string | null;
  mode: "live" | "demo";
  onFinalize: () => void;
  onEndHalfInning: (reason: "run_limit" | "time" | "manual") => void;
  onClose: () => void;
}

function fmt3(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(3).replace(/^0/, "");
}

function fmt2(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

function csvEscape(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function download(filename: string, content: string): void {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const BATTING_COLUMNS: (keyof BattingLine)[] = ["AB", "R", "H", "2B", "3B", "HR", "RBI", "BB", "SO", "SB", "AVG", "OBP", "SLG", "OPS"];
const PITCHING_COLUMNS: (keyof PitchingLine)[] = ["ip", "BF", "H", "R", "ER", "BB", "SO", "HR", "ERA", "WHIP", "OBA", "OSLG"];

export function ReportPanel(props: ReportPanelProps) {
  const { state, homeTeam, awayTeam, game, playerNames, jerseyOf, phase, canFinalize, busy, error, mode, onFinalize, onEndHalfInning, onClose } = props;
  const batting = useMemo(() => battingLines(state), [state]);
  const pitching = useMemo(() => pitchingLines(state), [state]);
  const fielding = useMemo(() => fieldingLines(state), [state]);
  const [finalizeArmed, setFinalizeArmed] = useState(false);
  const [tab, setTab] = useState<"batting" | "pitching" | "fielding">("batting");
  const person = (id: string): string => playerNames[id] ?? "—";
  const teams = [awayTeam, homeTeam];

  const exportCsv = (): void => {
    const lines: string[] = [];
    lines.push(["Equipo", "Jugador", "#", ...BATTING_COLUMNS].map(csvEscape).join(","));
    for (const team of teams) {
      for (const line of batting[team.id] ?? []) {
        lines.push([team.name, person(line.playerId), jerseyOf(line.playerId), ...BATTING_COLUMNS.map((c) => line[c] as string | number | null)].map(csvEscape).join(","));
      }
    }
    lines.push("");
    lines.push(["Equipo", "Pitcher", ...PITCHING_COLUMNS].map(csvEscape).join(","));
    for (const team of teams) {
      for (const line of pitching[team.id] ?? []) {
        lines.push([team.name, person(line.pitcherId), ...PITCHING_COLUMNS.map((c) => line[c] as string | number | null)].map(csvEscape).join(","));
      }
    }
    download(`box-score-${game.id.slice(0, 8)}.csv`, lines.join("\n"));
  };

  const pendingER = teams.reduce((sum, t) => sum + (pitching[t.id] ?? []).reduce((s, p) => s + p.pendingER, 0), 0);

  return (
    <SidePanel title="Reporte" subtitle={`${awayTeam.name} ${teamRuns(state, awayTeam.id)} — ${teamRuns(state, homeTeam.id)} ${homeTeam.name}`} onClose={onClose} width="xl" printable>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 print-hide">
          <div className="flex gap-1.5" role="tablist" aria-label="Sección del reporte">
            {(["batting", "pitching", "fielding"] as const).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("min-h-9 rounded-md border px-3 text-xs font-semibold", tab === t && "text-white")} style={{ borderColor: "var(--sheet-line-strong)", backgroundColor: tab === t ? "var(--sheet-ink)" : "transparent" }}>
                {t === "batting" ? "Bateo" : t === "pitching" ? "Pitcheo" : "Defensa"}
              </button>
            ))}
          </div>
          <span className="ml-auto flex gap-1.5">
            <PanelButton variant="secondary" onClick={exportCsv} className="min-h-9 px-3 text-xs">Exportar CSV</PanelButton>
            <PanelButton variant="secondary" onClick={() => window.print()} className="min-h-9 px-3 text-xs">Imprimir / PDF</PanelButton>
          </span>
        </div>

        {state.issues.length > 0 && (
          <p className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: "var(--sheet-error)", color: "var(--sheet-error)" }}>
            {state.issues.length} aviso(s) por revisar en la libreta. Las estadísticas son provisionales hasta finalizar.
          </p>
        )}
        {pendingER > 0 && (
          <p className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: "var(--sheet-error)", color: "var(--sheet-error)" }}>
            {pendingER} carrera(s) sin decidir si son limpias o sucias: la efectividad puede cambiar. Selecciona la jugada en la libreta para decidirlo.
          </p>
        )}

        {teams.map((team) => {
          const lines = batting[team.id] ?? [];
          const totals = teamBattingTotals(lines);
          return (
            <section key={team.id} aria-labelledby={`report-${team.id}-${tab}`} className="overflow-x-auto">
              <h3 id={`report-${team.id}-${tab}`} className="mb-1 flex items-center gap-2 font-display text-lg">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: team.color ?? "#666" }} aria-hidden />
                {team.name}
              </h3>
              {tab === "batting" && (
                <table className="w-full border-collapse text-xs tabular-nums">
                  <thead>
                    <tr style={{ color: "var(--sheet-muted)" }}>
                      <th scope="col" className="py-1 pr-2 text-left font-semibold">Jugador</th>
                      {BATTING_COLUMNS.map((c) => (
                        <th key={c} scope="col" className="min-w-8 py-1 text-right font-semibold">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.playerId} className="border-t sheet-line">
                        <th scope="row" className="py-1 pr-2 text-left font-medium">
                          {line.slot ?? "—"}. {person(line.playerId)} <span style={{ color: "var(--sheet-muted)" }}>{line.positions.join("/")}</span>
                        </th>
                        {BATTING_COLUMNS.map((c) => (
                          <td key={c} className="py-1 text-right">
                            {c === "AVG" || c === "OBP" || c === "SLG" || c === "OPS" ? fmt3(line[c] as number | null) : String(line[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="border-t-2 font-bold" style={{ borderColor: "var(--sheet-line-strong)" }}>
                      <th scope="row" className="py-1 pr-2 text-left">Totales</th>
                      {BATTING_COLUMNS.map((c) => (
                        <td key={c} className="py-1 text-right">
                          {c === "AVG" || c === "OBP" || c === "SLG" || c === "OPS" ? fmt3(totals[c] as number | null) : String(totals[c])}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              )}
              {tab === "pitching" && (
                <table className="w-full border-collapse text-xs tabular-nums">
                  <thead>
                    <tr style={{ color: "var(--sheet-muted)" }}>
                      <th scope="col" className="py-1 pr-2 text-left font-semibold">Pitcher</th>
                      {PITCHING_COLUMNS.map((c) => (
                        <th key={c} scope="col" className="min-w-8 py-1 text-right font-semibold" title={c === "ip" ? "Entradas lanzadas (6.1 = seis y un out)" : c === "BF" ? "Bateadores enfrentados" : c === "OBA" ? "Promedio de bateo rival" : c === "OSLG" ? "Slugging rival" : c === "ERA" ? `Efectividad sobre ${state.rules.eraInningsBase} entradas` : undefined}>
                          {c === "ip" ? "IP" : c}
                        </th>
                      ))}
                      <th scope="col" className="py-1 text-right font-semibold" title="Ganado / perdido / salvamento: decisión reglamentaria, no se infiere">Dec.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pitching[team.id] ?? []).map((line) => (
                      <tr key={line.pitcherId} className="border-t sheet-line">
                        <th scope="row" className="py-1 pr-2 text-left font-medium">
                          {person(line.pitcherId)}
                          {line.pendingER > 0 && <span className="ml-1" style={{ color: "var(--sheet-error)" }} title="Carreras pendientes de clasificar">*</span>}
                        </th>
                        {PITCHING_COLUMNS.map((c) => (
                          <td key={c} className="py-1 text-right">
                            {c === "ERA" || c === "WHIP" ? fmt2(line[c] as number | null) : c === "OBA" || c === "OSLG" ? fmt3(line[c] as number | null) : String(line[c])}
                          </td>
                        ))}
                        <td className="py-1 text-right" style={{ color: "var(--sheet-muted)" }}>{line.decision ?? "pend."}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {tab === "fielding" && (
                <table className="w-full border-collapse text-xs tabular-nums">
                  <thead>
                    <tr style={{ color: "var(--sheet-muted)" }}>
                      <th scope="col" className="py-1 pr-2 text-left font-semibold">Jugador</th>
                      <th scope="col" className="py-1 text-right font-semibold" title="Outs realizados">PO</th>
                      <th scope="col" className="py-1 text-right font-semibold" title="Asistencias">A</th>
                      <th scope="col" className="py-1 text-right font-semibold" title="Errores">E</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fielding[team.id] ?? []).map((line) => (
                      <tr key={line.playerId} className="border-t sheet-line">
                        <th scope="row" className="py-1 pr-2 text-left font-medium">
                          {person(line.playerId)} <span style={{ color: "var(--sheet-muted)" }}>{line.positions.join("/")}</span>
                        </th>
                        <td className="py-1 text-right">{line.PO}</td>
                        <td className="py-1 text-right">{line.A}</td>
                        <td className="py-1 text-right">{line.E}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}

        {phase === "scoring" && (
          <section className="flex flex-col gap-2 rounded-lg border p-3 print-hide" style={{ borderColor: "var(--sheet-line-strong)" }} aria-labelledby="report-close">
            <h3 id="report-close" className="font-display text-lg">Cerrar</h3>
            <p className="text-xs" style={{ color: "var(--sheet-muted)" }}>
              {state.endCondition
                ? "Las reglas indican que el partido terminó. Revisa el marcador y finaliza."
                : "Finalizar antes de completar las entradas requiere justificación reglamentaria (tiempo, misericordia, forfeit)."}
            </p>
            <div className="flex flex-wrap gap-2">
              {state.rules.runLimitPerInning && (
                <PanelButton variant="secondary" onClick={() => onEndHalfInning("run_limit")} className="text-xs">Cerrar media entrada por tope de carreras</PanelButton>
              )}
              <PanelButton variant="secondary" onClick={() => onEndHalfInning("time")} className="text-xs">Cerrar media entrada por tiempo</PanelButton>
            </div>
            {error && <p role="alert" className="text-sm" style={{ color: "var(--sheet-out)" }}>{error}</p>}
            {canFinalize ? (
              finalizeArmed ? (
                <div className="flex flex-wrap gap-2">
                  <PanelButton variant="danger" onClick={() => { setFinalizeArmed(false); onFinalize(); }} disabled={busy}>{busy ? "Finalizando…" : "Confirmar: finalizar partido"}</PanelButton>
                  <PanelButton variant="secondary" onClick={() => setFinalizeArmed(false)}>Cancelar</PanelButton>
                </div>
              ) : (
                <PanelButton variant="primary" onClick={() => setFinalizeArmed(true)} disabled={busy}>Finalizar partido…</PanelButton>
              )
            ) : (
              <p className="text-xs" style={{ color: "var(--sheet-muted)" }}>Solo el administrador de la liga o el anotador asignado pueden finalizar.</p>
            )}
            {mode === "demo" && <p className="text-xs" style={{ color: "var(--sheet-muted)" }}>En modo demo el cierre no se envía a ningún servidor.</p>}
          </section>
        )}
      </div>
    </SidePanel>
  );
}
