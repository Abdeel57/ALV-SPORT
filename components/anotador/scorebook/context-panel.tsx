"use client";

import { currentPitcher, nextBatter, onDeckBatter, type PlateAppearance, type ScorebookStateInternal } from "@/lib/engine/scorebook";
import { cn } from "@/lib/utils";
import { BasesDiamond } from "../ui/bases-diamond";
import { PositionBadge } from "../ui/position-badge";
import type { ConsoleTeam } from "../types";

/**
 * Panel contextual: bateador actual, siguiente, pitcher, bases y outs, y
 * el detalle de la jugada seleccionada (consultar NO cambia al bateador).
 */

export interface ContextPanelProps {
  state: ScorebookStateInternal;
  homeTeam: ConsoleTeam;
  awayTeam: ConsoleTeam;
  playerNames: Record<string, string>;
  jerseyOf: (playerId: string) => string | null;
  selectedPa: PlateAppearance | null;
  onClearSelection: () => void;
  onCorrectPlay: (playId: string) => void;
  canCorrect: boolean;
  onClose?: () => void;
  className?: string;
  /** Partido finalizado: ya no hay bateador en turno. */
  finished?: boolean;
}

const REASON_LABELS: Record<string, string> = {
  hit: "por hit",
  batted_ball: "por batazo",
  walk: "por base por bolas",
  forced: "forzado",
  error: "por error",
  stolen_base: "robo",
  caught_stealing: "out robando",
  wild_pitch: "wild pitch",
  passed_ball: "passed ball",
  balk: "balk",
  pickoff: "pickoff",
  sacrifice: "por sacrificio",
  fielders_choice: "por elección",
  tag: "toque",
  home_run: "jonrón",
  manual: "manual",
  defensive_indifference: "indiferencia",
};

function baseLabel(base: number): string {
  return base === 0 ? "home" : base === 4 ? "home" : `${base}ª`;
}

export function ContextPanel(props: ContextPanelProps) {
  const { state, homeTeam, awayTeam, playerNames, jerseyOf, selectedPa, onClearSelection, onCorrectPlay, canCorrect, onClose, className, finished } = props;
  const batter = nextBatter(state);
  const onDeck = onDeckBatter(state);
  const pitcher = currentPitcher(state);
  const battingTeam = state.battingTeamId === homeTeam.id ? homeTeam : awayTeam;
  const fieldingTeam = state.fieldingTeamId === homeTeam.id ? homeTeam : awayTeam;
  const pitchesThisPA = state.currentPA?.pitches ?? [];
  const play = selectedPa ? state.plays.find((p) => p.playId === selectedPa.id) ?? null : null;
  const relatedPlays = selectedPa
    ? state.plays.filter((p) => selectedPa.path.some((segment) => segment.playId === p.playId) && p.playId !== selectedPa.id)
    : [];

  const person = (playerId: string | null | undefined): string => (playerId ? (playerNames[playerId] ?? "—") : "—");

  return (
    <aside className={cn("sheet flex flex-col gap-3 overflow-y-auto border-l px-3 py-3 text-sm sheet-line", className)} aria-label="Contexto del partido">
      {onClose && (
        <button type="button" onClick={onClose} className="self-end text-xs underline" style={{ color: "var(--sheet-muted)" }}>
          Cerrar panel
        </button>
      )}

      {finished ? (
        <p className="rounded-lg border px-2.5 py-2 text-xs font-semibold" style={{ borderColor: "var(--sheet-line-strong)" }}>
          Partido finalizado: la libreta es de solo lectura. Abre Reporte para el box score.
        </p>
      ) : (
      <section aria-labelledby="ctx-batter" className="flex flex-col gap-2">
        <h2 id="ctx-batter" className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>
          Al bate · {battingTeam.name}
        </h2>
        {batter ? (
          <div className="flex items-center gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: "var(--sheet-run)", backgroundColor: "var(--sheet-active)" }}>
            <span className="grid size-9 place-items-center rounded-md font-display text-lg tabular-nums" style={{ backgroundColor: "var(--sheet-bg)" }}>
              {batter.slot}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{person(batter.playerId)}</span>
              <span className="block text-xs tabular-nums" style={{ color: "var(--sheet-muted)" }}>
                #{jerseyOf(batter.playerId) ?? "—"} · cuenta {state.balls}-{state.strikes}
                {pitchesThisPA.length > 0 && ` · ${pitchesThisPA.length} lanz.`}
              </span>
            </span>
            <PositionBadge code={batter.position ?? (batter.role !== "starter" && batter.role !== "sub" ? batter.role : null)} />
          </div>
        ) : (
          <p style={{ color: "var(--sheet-muted)" }}>Sin alineación.</p>
        )}
        {onDeck && (
          <p className="text-xs" style={{ color: "var(--sheet-muted)" }}>
            Sigue: <strong style={{ color: "var(--sheet-ink)" }}>{onDeck.slot}. {person(onDeck.playerId)}</strong>
          </p>
        )}
      </section>
      )}

      <section aria-labelledby="ctx-pitcher" className="flex flex-col gap-1">
        <h2 id="ctx-pitcher" className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>
          Lanza · {fieldingTeam.name}
        </h2>
        <p className="flex items-center gap-2">
          <PositionBadge code="P" size="xs" />
          <span className="truncate font-semibold">{pitcher ? person(pitcher.playerId) : "Sin pitcher asignado"}</span>
        </p>
      </section>

      <BasesDiamond bases={state.bases} outs={state.outs} playerNames={playerNames} batterName={batter ? person(batter.playerId) : null} size={150} className="self-center" />

      {state.endCondition && (
        <p className="rounded-lg border px-2.5 py-2 text-xs font-semibold" style={{ borderColor: "var(--sheet-run)", color: "var(--sheet-ink)", backgroundColor: "var(--sheet-active)" }} role="status">
          {state.endCondition.reason === "walk_off"
            ? "Carrera de la victoria: el partido terminó."
            : state.endCondition.reason === "mercy"
              ? "Se cumplió la regla de misericordia."
              : "Se completaron las entradas reglamentarias."}{" "}
          Revisa y finaliza desde Reporte.
        </p>
      )}

      {selectedPa && (
        <section aria-labelledby="ctx-play" className="flex flex-col gap-2 rounded-lg border p-2.5" style={{ borderColor: "var(--sheet-select)" }}>
          <div className="flex items-center justify-between gap-2">
            <h2 id="ctx-play" className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-select)" }}>
              Jugada seleccionada
            </h2>
            <button type="button" onClick={onClearSelection} className="text-xs underline" style={{ color: "var(--sheet-muted)" }}>
              Quitar
            </button>
          </div>
          <p className="font-semibold">
            {person(selectedPa.batterId)} · entrada {selectedPa.inning} · <span className="tabular-nums">{selectedPa.code || "en curso"}</span>
          </p>
          {play && <p className="text-xs">{play.text}</p>}
          <ul className="text-xs" style={{ color: "var(--sheet-muted)" }}>
            {selectedPa.path.map((segment, index) => (
              <li key={index}>
                {baseLabel(segment.from)} → {baseLabel(segment.to)} {REASON_LABELS[segment.reason] ?? segment.reason}
                {segment.out ? " · out" : ""}
              </li>
            ))}
            {selectedPa.rbi > 0 && <li>{selectedPa.rbi} impulsada(s)</li>}
            {selectedPa.earnedRun !== null && selectedPa.scored && <li>Carrera {selectedPa.earnedRun ? "limpia" : "sucia"}</li>}
            {selectedPa.scored && selectedPa.earnedRun === null && <li style={{ color: "var(--sheet-error)" }}>Limpia/sucia pendiente de decidir</li>}
          </ul>
          {relatedPlays.length > 0 && (
            <p className="text-xs" style={{ color: "var(--sheet-muted)" }}>
              Avances en jugadas posteriores: {relatedPlays.map((p) => p.text).join(" · ")}
            </p>
          )}
          {canCorrect && selectedPa.result !== null && (
            <button
              type="button"
              onClick={() => onCorrectPlay(selectedPa.id)}
              className="min-h-10 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--sheet-bg-alt)]"
              style={{ borderColor: "var(--sheet-out)", color: "var(--sheet-out)" }}
            >
              Anular esta jugada…
            </button>
          )}
        </section>
      )}

      {state.issues.length > 0 && (
        <section aria-labelledby="ctx-issues" className="flex flex-col gap-1">
          <h2 id="ctx-issues" className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-error)" }}>
            Por revisar ({state.issues.length})
          </h2>
          <ul className="flex flex-col gap-1 text-xs">
            {state.issues.slice(-6).map((issue, index) => (
              <li key={index} style={{ color: issue.severity === "error" ? "var(--sheet-out)" : "var(--sheet-error)" }}>
                ● {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
