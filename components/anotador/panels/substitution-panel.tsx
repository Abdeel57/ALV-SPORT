"use client";

import { useMemo, useState } from "react";
import { positionsFor, type LineupSlot, type ScorebookStateInternal, type SubstitutionDraft } from "@/lib/engine/scorebook";
import { cn } from "@/lib/utils";
import { PositionBadge } from "../ui/position-badge";
import { PanelButton, SidePanel } from "../ui/side-panel";
import type { ConsoleTeam } from "../types";

/**
 * Sustituciones, cambios defensivos y cambio de pitcher. Todo queda como
 * evento con momento efectivo: las estadísticas de quien sale se quedan con
 * quien sale.
 */

export interface SubstitutionPanelProps {
  state: ScorebookStateInternal;
  homeTeam: ConsoleTeam;
  awayTeam: ConsoleTeam;
  playerNames: Record<string, string>;
  error: string | null;
  onSubstitute: (draft: SubstitutionDraft) => void;
  onDefensiveChange: (teamId: string, changes: { playerId: string; position: string | null }[]) => void;
  onClose: () => void;
}

type Mode = "substitution" | "defense";

export function SubstitutionPanel({ state, homeTeam, awayTeam, playerNames, error, onSubstitute, onDefensiveChange, onClose }: SubstitutionPanelProps) {
  const [teamId, setTeamId] = useState<string>(state.fieldingTeamId);
  const [mode, setMode] = useState<Mode>("substitution");
  const team = teamId === homeTeam.id ? homeTeam : awayTeam;
  const book = state.teams[teamId]!;
  const slots = useMemo(() => [...book.slots].sort((a, b) => a.slot - b.slot), [book.slots]);
  const positions = positionsFor(state.rules.fielders);
  const person = (id: string): string => playerNames[id] ?? "—";

  // --- Sustitución ---
  const [outSlot, setOutSlot] = useState<number | null>(null);
  const [inPlayerId, setInPlayerId] = useState<string>("");
  const [subPosition, setSubPosition] = useState<string>("");
  const [subRole, setSubRole] = useState<SubstitutionDraft["role"]>("sub");
  const inLineup = new Set(slots.map((s) => s.playerId));
  const bench = team.roster.filter((p) => !inLineup.has(p.playerId));
  const outgoing: LineupSlot | undefined = slots.find((s) => s.slot === outSlot);
  const reentryBlocked = (playerId: string): boolean =>
    !state.rules.reentryAllowed && book.substitutions.some((s) => s.outPlayerId === playerId);

  const submitSubstitution = (): void => {
    if (!outgoing || !inPlayerId) return;
    onSubstitute({
      teamId,
      slot: outgoing.slot,
      inPlayerId,
      outPlayerId: outgoing.playerId,
      position: subPosition || outgoing.position,
      role: subRole,
    });
  };

  // --- Cambio defensivo ---
  const [defense, setDefense] = useState<Record<string, string | null>>({});
  const effectivePosition = (slot: LineupSlot): string | null => (slot.playerId in defense ? defense[slot.playerId]! : slot.position);
  const changes = slots
    .filter((slot) => slot.playerId in defense && defense[slot.playerId] !== slot.position)
    .map((slot) => ({ playerId: slot.playerId, position: defense[slot.playerId] ?? null }));
  const usedByOthers = (playerId: string, code: string): boolean =>
    slots.some((s) => s.playerId !== playerId && effectivePosition(s) === code);

  return (
    <SidePanel title="Cambios" subtitle={`${team.name} · entrada ${state.inning}`} onClose={onClose} width="lg">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Equipo">
          {[awayTeam, homeTeam].map((t) => (
            <button key={t.id} type="button" aria-pressed={teamId === t.id} onClick={() => { setTeamId(t.id); setOutSlot(null); setInPlayerId(""); setDefense({}); }} className={cn("min-h-10 rounded-md border px-3 text-sm font-semibold", teamId === t.id && "text-white")} style={{ borderColor: "var(--sheet-line-strong)", backgroundColor: teamId === t.id ? "var(--sheet-ink)" : "transparent" }}>
              <span className="mr-1.5 inline-block size-2.5 rounded-full align-middle" style={{ backgroundColor: t.color ?? "#666" }} aria-hidden />
              {t.name}
              {t.id === state.fieldingTeamId && <span className="ml-1 text-[10px] uppercase opacity-70">defiende</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5" role="tablist" aria-label="Tipo de cambio">
          {(["substitution", "defense"] as Mode[]).map((m) => (
            <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("min-h-10 flex-1 rounded-md border px-3 text-sm font-semibold", mode === m && "text-white")} style={{ borderColor: "var(--sheet-line-strong)", backgroundColor: mode === m ? "var(--sheet-ink)" : "transparent" }}>
              {m === "substitution" ? "Sustitución (entra de la banca)" : "Cambio defensivo / pitcher"}
            </button>
          ))}
        </div>

        {mode === "substitution" && (
          <div className="flex flex-col gap-3">
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>Sale</legend>
              <div className="flex flex-col gap-1">
                {slots.map((slot) => (
                  <label key={slot.slot} className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-2 text-sm", outSlot === slot.slot && "ring-2 ring-[var(--sheet-select)]")} style={{ borderColor: "var(--sheet-line)" }}>
                    <input type="radio" name="out-slot" className="size-4" checked={outSlot === slot.slot} onChange={() => { setOutSlot(slot.slot); setSubPosition(slot.position ?? ""); }} />
                    <span className="w-5 text-center font-display tabular-nums">{slot.slot}</span>
                    <span className="min-w-0 flex-1 truncate">{person(slot.playerId)}</span>
                    <PositionBadge code={slot.position ?? (slot.role !== "starter" && slot.role !== "sub" ? slot.role : null)} size="xs" />
                    {state.bases[1]?.playerId === slot.playerId || state.bases[2]?.playerId === slot.playerId || state.bases[3]?.playerId === slot.playerId ? (
                      <span className="text-[10px] uppercase" style={{ color: "var(--sheet-run)" }}>en base</span>
                    ) : null}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>Entra</legend>
              {bench.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--sheet-muted)" }}>No hay jugadores en la banca.</p>
              ) : (
                <select value={inPlayerId} onChange={(e) => setInPlayerId(e.target.value)} className="min-h-10 rounded-md border bg-transparent px-2 text-sm" style={{ borderColor: "var(--sheet-line-strong)" }} aria-label="Jugador que entra">
                  <option value="">Elige…</option>
                  {bench.map((p) => (
                    <option key={p.playerId} value={p.playerId} disabled={reentryBlocked(p.playerId)}>
                      {p.jerseyNumber ? `#${p.jerseyNumber} ` : ""}{p.lastName}, {p.firstName}{reentryBlocked(p.playerId) ? " (sin reingreso)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>Posición</span>
                <select value={subPosition} onChange={(e) => setSubPosition(e.target.value)} className="min-h-10 rounded-md border bg-transparent px-2 text-sm" style={{ borderColor: "var(--sheet-line-strong)" }}>
                  <option value="">Sin posición (solo batea)</option>
                  {positions.map((p) => (
                    <option key={p.code} value={p.code} disabled={outgoing?.position !== p.code && slots.some((s) => s.position === p.code)}>
                      {p.code} · {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>Tipo</span>
                <select value={subRole} onChange={(e) => setSubRole(e.target.value as SubstitutionDraft["role"])} className="min-h-10 rounded-md border bg-transparent px-2 text-sm" style={{ borderColor: "var(--sheet-line-strong)" }}>
                  <option value="sub">Sustituto</option>
                  <option value="PH">Bateador emergente (PH)</option>
                  <option value="PR">Corredor emergente (PR)</option>
                  <option value="EP">Jugador extra (EP)</option>
                  <option value="DH">Designado (DH)</option>
                </select>
              </label>
            </div>
            <p className="text-xs" style={{ color: "var(--sheet-muted)" }}>
              Si el que sale está en base, el que entra toma su base (corredor emergente). Las estadísticas de cada quien se quedan con cada quien.
            </p>
            {error && <p role="alert" className="text-sm" style={{ color: "var(--sheet-out)" }}>{error}</p>}
            <PanelButton variant="primary" onClick={submitSubstitution} disabled={!outgoing || !inPlayerId} autoFocus>Confirmar sustitución</PanelButton>
          </div>
        )}

        {mode === "defense" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs" style={{ color: "var(--sheet-muted)" }}>
              Cambia las posiciones de quienes ya están en el campo. Para cambio de pitcher, asigna P al nuevo y otra posición (o ninguna) al anterior.
            </p>
            <ol className="flex flex-col gap-1">
              {slots.map((slot) => (
                <li key={slot.slot} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm" style={{ borderColor: "var(--sheet-line)" }}>
                  <span className="w-5 text-center font-display tabular-nums">{slot.slot}</span>
                  <span className="min-w-0 flex-1 truncate">{person(slot.playerId)}</span>
                  <PositionBadge code={effectivePosition(slot)} size="xs" />
                  <select value={effectivePosition(slot) ?? ""} onChange={(e) => setDefense((d) => ({ ...d, [slot.playerId]: e.target.value || null }))} className="min-h-9 rounded-md border bg-transparent px-1.5 text-xs" style={{ borderColor: "var(--sheet-line-strong)" }} aria-label={`Posición de ${person(slot.playerId)}`}>
                    <option value="">—</option>
                    {positions.map((p) => (
                      <option key={p.code} value={p.code} disabled={usedByOthers(slot.playerId, p.code)}>
                        {p.code}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ol>
            {error && <p role="alert" className="text-sm" style={{ color: "var(--sheet-out)" }}>{error}</p>}
            <PanelButton variant="primary" onClick={() => onDefensiveChange(teamId, changes)} disabled={changes.length === 0}>
              Aplicar {changes.length > 0 ? `${changes.length} cambio${changes.length === 1 ? "" : "s"}` : "cambios"}
            </PanelButton>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
