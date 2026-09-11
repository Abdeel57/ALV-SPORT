"use client";

import type { ScorebookStateInternal } from "@/lib/engine/scorebook";
import { teamRuns } from "@/lib/engine/scorebook";
import { cn } from "@/lib/utils";
import type { ConsoleGame, ConsoleTeam } from "../types";

/**
 * Franja superior compacta: equipos, carreras por entrada, R/H/E, entrada
 * alta/baja, cuenta, outs y estado. Es información de trabajo, no un
 * marcador gigante: la libreta es la protagonista.
 */

export interface ScoreboardStripProps {
  state: ScorebookStateInternal;
  homeTeam: ConsoleTeam;
  awayTeam: ConsoleTeam;
  game: ConsoleGame;
  phase: "setup" | "scoring" | "finished";
  compact?: boolean;
}

export function ScoreboardStrip({ state, homeTeam, awayTeam, game, phase, compact }: ScoreboardStripProps) {
  const inningsToShow = Math.max(state.rules.innings, state.inning);
  const innings = Array.from({ length: inningsToShow }, (_, i) => i + 1);
  const rows = [awayTeam, homeTeam].map((team) => {
    const book = state.teams[team.id]!;
    return {
      team,
      runs: innings.map((inning) => book.line.runs[inning - 1] ?? null),
      R: teamRuns(state, team.id),
      H: book.line.hits,
      E: book.line.errors,
      batting: state.battingTeamId === team.id && phase === "scoring",
    };
  });

  const halfArrow = state.half === "top" ? "▲" : "▼";
  const statusLabel =
    phase === "finished"
      ? "Final"
      : phase === "setup"
        ? "Preparación"
        : state.endCondition
          ? "Por finalizar"
          : "En vivo";

  return (
    <header
      className={cn(
        "sheet flex flex-wrap items-stretch gap-x-4 gap-y-2 border-b px-3 py-2 sheet-line",
        compact ? "text-xs" : "text-sm",
      )}
      aria-label="Marcador"
    >
      <div className="flex min-w-0 flex-col justify-center">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--sheet-muted)" }}>
          {game.leagueName} · {game.seasonName}
        </p>
        <p className="flex items-center gap-2 font-display text-lg leading-tight">
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider",
              phase === "scoring" && !state.endCondition ? "text-white" : "",
            )}
            style={{
              backgroundColor:
                phase === "scoring" && !state.endCondition ? "var(--sheet-out)" : "var(--sheet-bg-alt)",
              color: phase === "scoring" && !state.endCondition ? "#fff" : "var(--sheet-ink)",
            }}
          >
            {statusLabel}
          </span>
          {phase === "scoring" && (
            <span className="tabular-nums" aria-label={`${state.half === "top" ? "Alta" : "Baja"} de la entrada ${state.inning}`}>
              {halfArrow} {state.inning}
              {state.inning > state.rules.innings && <span className="text-xs"> extra</span>}
            </span>
          )}
        </p>
      </div>

      <div className="min-w-0 flex-1 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-center tabular-nums">
          <thead>
            <tr style={{ color: "var(--sheet-muted)" }}>
              <th className="w-36 py-0.5 pr-2 text-left text-[11px] font-semibold uppercase tracking-wider" scope="col">
                Equipo
              </th>
              {innings.map((inning) => (
                <th key={inning} scope="col" className={cn("min-w-6 py-0.5 text-[11px] font-semibold", inning === state.inning && phase === "scoring" && "underline decoration-2 decoration-[var(--sheet-run)]")}>
                  {inning}
                </th>
              ))}
              <th scope="col" className="min-w-7 border-l py-0.5 text-[11px] font-bold sheet-line">R</th>
              <th scope="col" className="min-w-7 py-0.5 text-[11px] font-bold">H</th>
              <th scope="col" className="min-w-7 py-0.5 text-[11px] font-bold">E</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.team.id} className={cn(row.batting && "font-semibold")}>
                <th scope="row" className="truncate py-0.5 pr-2 text-left font-semibold">
                  <span className="mr-1.5 inline-block size-2.5 rounded-full align-middle" style={{ backgroundColor: row.team.color ?? "#666" }} aria-hidden />
                  <span className="align-middle">{row.team.name}</span>
                  {row.batting && (
                    <span className="sr-only"> (al bate)</span>
                  )}
                </th>
                {row.runs.map((runs, index) => (
                  <td key={index} className="py-0.5">
                    {runs === null ? <span style={{ color: "var(--sheet-line-strong)" }}>·</span> : runs}
                  </td>
                ))}
                <td className="border-l py-0.5 font-display text-base sheet-line">{row.R}</td>
                <td className="py-0.5">{row.H}</td>
                <td className="py-0.5">{row.E}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {phase === "scoring" && (
        <dl className="flex items-center gap-4 tabular-nums" aria-label="Cuenta y outs">
          <div className="text-center">
            <dt className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>Bolas</dt>
            <dd className="font-display text-2xl leading-none">{state.balls}</dd>
          </div>
          <div className="text-center">
            <dt className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>Strikes</dt>
            <dd className="font-display text-2xl leading-none">{state.strikes}</dd>
          </div>
          <div className="text-center">
            <dt className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>Outs</dt>
            <dd className="flex items-center justify-center gap-1 pt-1" aria-label={`${state.outs} outs`}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="inline-block size-3.5 rounded-full border-2"
                  style={{ borderColor: "var(--sheet-out)", backgroundColor: i < state.outs ? "var(--sheet-out)" : "transparent" }}
                  aria-hidden
                />
              ))}
            </dd>
          </div>
        </dl>
      )}
    </header>
  );
}
