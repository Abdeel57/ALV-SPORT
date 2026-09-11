"use client";

import { useMemo, useState } from "react";
import { POSITIONS, positionsFor, type RulesProfile } from "@/lib/engine/scorebook";
import { cn } from "@/lib/utils";
import { PositionBadge } from "../ui/position-badge";
import type { ConsoleTeam, LineupSlotInput, LineupsInput, RosterPlayer } from "../types";

/**
 * Preparación del partido: para cada equipo, quién batea, en qué orden y
 * en qué posición defiende. Todo con botones accesibles (subir/bajar,
 * quitar); arrastrar es un extra. Valida contra el perfil de reglas.
 */

export interface LineupBuilderProps {
  homeTeam: ConsoleTeam;
  awayTeam: ConsoleTeam;
  rules: RulesProfile;
  rulesSource: "snapshot" | "league" | "default";
  initialLineups?: LineupsInput;
  previousLineups?: LineupsInput;
  sanctionedPlayerIds: string[];
  busy: boolean;
  error: string | null;
  demoMode: boolean;
  onConfirm: (lineups: LineupsInput) => void;
}

type Role = LineupSlotInput["role"];

interface Row {
  playerId: string;
  position: string | null;
  role: Role;
}

const ROLE_LABELS: Record<Role, string> = {
  starter: "Titular",
  EP: "EP · jugador extra",
  DH: "DH · designado",
  FLEX: "FLEX · solo defiende",
};

function rowsFromInput(list: LineupSlotInput[] | undefined): Row[] {
  if (!list) return [];
  return [...list]
    .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99))
    .map((slot) => ({ playerId: slot.playerId, position: slot.position, role: slot.role }));
}

function toInput(rows: Row[]): LineupSlotInput[] {
  let order = 0;
  return rows.map((row) => {
    if (row.role === "FLEX") return { playerId: row.playerId, slot: null, position: row.position, role: row.role };
    order += 1;
    return { playerId: row.playerId, slot: order, position: row.position, role: row.role };
  });
}

function validate(rows: Row[], rules: RulesProfile): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const batters = rows.filter((r) => r.role !== "FLEX");
  if (batters.length < rules.minBatters) errors.push(`Faltan bateadores: mínimo ${rules.minBatters}, hay ${batters.length}.`);
  if (batters.length > rules.maxBatters) errors.push(`Demasiados bateadores: máximo ${rules.maxBatters}.`);
  const positions = rows.map((r) => r.position).filter((p): p is string => p !== null);
  const dup = positions.filter((p, i) => positions.indexOf(p) !== i);
  if (dup.length > 0) errors.push(`Posición repetida: ${[...new Set(dup)].join(", ")}.`);
  if (positions.length > rules.fielders) errors.push(`Máximo ${rules.fielders} defensivos.`);
  for (const row of rows) {
    if ((row.role === "EP" || row.role === "DH") && row.position) {
      errors.push("Un EP o DH no defiende: quítale la posición o márcalo como titular.");
      break;
    }
    if (row.role === "FLEX" && !row.position) {
      errors.push("Un FLEX necesita posición defensiva.");
      break;
    }
  }
  if (!positions.includes("P")) warnings.push("No hay pitcher asignado.");
  if (!positions.includes("C")) warnings.push("No hay receptor asignado.");
  return { errors, warnings };
}

function TeamEditor({
  team,
  rows,
  rules,
  sanctioned,
  previous,
  onChange,
}: {
  team: ConsoleTeam;
  rows: Row[];
  rules: RulesProfile;
  sanctioned: ReadonlySet<string>;
  previous: LineupSlotInput[] | undefined;
  onChange: (rows: Row[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const byId = useMemo(() => new Map(team.roster.map((p) => [p.playerId, p])), [team.roster]);
  const inLineup = new Set(rows.map((r) => r.playerId));
  const bench = team.roster.filter((p) => !inLineup.has(p.playerId));
  const positions = positionsFor(rules.fielders);
  const usedPositions = new Set(rows.map((r) => r.position).filter(Boolean));
  const { errors, warnings } = validate(rows, rules);

  const update = (index: number, patch: Partial<Row>): void => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const move = (index: number, delta: number): void => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row!);
    onChange(next);
  };
  const remove = (index: number): void => onChange(rows.filter((_, i) => i !== index));
  const add = (player: RosterPlayer): void => {
    // Posición sugerida: la del roster si está libre; si no, la primera libre.
    const suggested =
      player.position && !usedPositions.has(player.position) && positions.some((p) => p.code === player.position)
        ? player.position
        : (positions.find((p) => !usedPositions.has(p.code))?.code ?? null);
    const batters = rows.filter((r) => r.role !== "FLEX").length;
    const role: Role = suggested ? "starter" : batters >= rules.fielders ? "EP" : "starter";
    onChange([...rows, { playerId: player.playerId, position: role === "EP" ? null : suggested, role }]);
  };
  const loadPrevious = (): void => {
    if (!previous) return;
    const valid = rowsFromInput(previous).filter((r) => byId.has(r.playerId) && !sanctioned.has(r.playerId));
    onChange(valid);
  };

  const name = (playerId: string): string => {
    const p = byId.get(playerId);
    return p ? `${p.lastName}, ${p.firstName}` : "—";
  };
  const jersey = (playerId: string): string => byId.get(playerId)?.jerseyNumber ?? "—";

  let order = 0;

  return (
    <section className="sheet flex min-w-0 flex-1 flex-col rounded-xl border sheet-line" aria-labelledby={`lineup-${team.id}`}>
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2 sheet-line">
        <span className="size-3 rounded-full" style={{ backgroundColor: team.color ?? "#666" }} aria-hidden />
        <h2 id={`lineup-${team.id}`} className="font-display text-xl">
          {team.name}
        </h2>
        <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--sheet-muted)" }}>
          {rows.filter((r) => r.role !== "FLEX").length} bateadores · {usedPositions.size}/{rules.fielders} defensivos
        </span>
        {previous && previous.length > 0 && (
          <button
            type="button"
            onClick={loadPrevious}
            className="min-h-9 rounded-md border px-2.5 text-xs font-semibold hover:bg-[var(--sheet-bg-alt)]"
            style={{ borderColor: "var(--sheet-line-strong)" }}
          >
            Cargar alineación anterior
          </button>
        )}
      </header>

      <ol className="flex flex-col divide-y sheet-line" aria-label={`Orden al bate de ${team.name}`}>
        {rows.length === 0 && (
          <li className="px-3 py-4 text-sm" style={{ color: "var(--sheet-muted)" }}>
            Agrega jugadores desde la banca. El orden en que los agregues es el orden al bate; puedes moverlos después.
          </li>
        )}
        {rows.map((row, index) => {
          if (row.role !== "FLEX") order += 1;
          const label = row.role === "FLEX" ? "F" : String(order);
          return (
            <li
              key={row.playerId}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragIndex === null || dragIndex === index) return;
                const next = [...rows];
                const [moved] = next.splice(dragIndex, 1);
                next.splice(index, 0, moved!);
                onChange(next);
                setDragIndex(null);
              }}
              className={cn("flex flex-wrap items-center gap-2 px-2 py-1.5", dragIndex === index && "opacity-50")}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-md font-display text-base tabular-nums" style={{ backgroundColor: "var(--sheet-bg-alt)" }} aria-label={row.role === "FLEX" ? "No batea" : `Turno ${order}`}>
                {label}
              </span>
              <span className="w-8 shrink-0 text-center text-sm tabular-nums" style={{ color: "var(--sheet-muted)" }}>
                {jersey(row.playerId)}
              </span>
              <span className="min-w-[9rem] flex-1 truncate text-sm font-medium" title={name(row.playerId)}>
                {name(row.playerId)}
              </span>
              <label className="flex items-center gap-1.5 text-xs">
                <span className="sr-only">Posición de {name(row.playerId)}</span>
                <PositionBadge code={row.position ?? (row.role !== "starter" ? row.role : null)} size="sm" />
                <select
                  value={row.position ?? ""}
                  onChange={(event) => update(index, { position: event.target.value || null })}
                  className="min-h-9 rounded-md border bg-transparent px-1.5 text-sm"
                  style={{ borderColor: "var(--sheet-line-strong)" }}
                  disabled={row.role === "EP" || row.role === "DH"}
                >
                  <option value="">Sin posición</option>
                  {positions.map((p) => (
                    <option key={p.code} value={p.code} disabled={usedPositions.has(p.code) && row.position !== p.code}>
                      {p.code} · {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <span className="sr-only">Rol de {name(row.playerId)}</span>
                <select
                  value={row.role}
                  onChange={(event) => {
                    const role = event.target.value as Role;
                    update(index, { role, position: role === "EP" || role === "DH" ? null : row.position });
                  }}
                  className="min-h-9 rounded-md border bg-transparent px-1.5 text-sm"
                  style={{ borderColor: "var(--sheet-line-strong)" }}
                >
                  {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </label>
              <span className="flex items-center gap-0.5">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Subir en el orden" className="grid size-9 place-items-center rounded-md border text-sm hover:bg-[var(--sheet-bg-alt)] disabled:opacity-30" style={{ borderColor: "var(--sheet-line)" }}>
                  ▲
                </button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === rows.length - 1} aria-label="Bajar en el orden" className="grid size-9 place-items-center rounded-md border text-sm hover:bg-[var(--sheet-bg-alt)] disabled:opacity-30" style={{ borderColor: "var(--sheet-line)" }}>
                  ▼
                </button>
                <button type="button" onClick={() => remove(index)} aria-label={`Quitar a ${name(row.playerId)}`} className="grid size-9 place-items-center rounded-md border text-sm hover:bg-[var(--sheet-bg-alt)]" style={{ borderColor: "var(--sheet-line)", color: "var(--sheet-out)" }}>
                  ✕
                </button>
              </span>
            </li>
          );
        })}
      </ol>

      {(errors.length > 0 || warnings.length > 0) && (
        <ul className="flex flex-col gap-1 px-3 py-2 text-xs" aria-live="polite">
          {errors.map((e) => (
            <li key={e} style={{ color: "var(--sheet-out)" }}>
              ● {e}
            </li>
          ))}
          {warnings.map((w) => (
            <li key={w} style={{ color: "var(--sheet-error)" }}>
              ● {w}
            </li>
          ))}
        </ul>
      )}

      <div className="border-t px-3 py-2 sheet-line">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>
          Banca ({bench.length})
        </p>
        {bench.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--sheet-muted)" }}>Todo el roster está en la alineación.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {bench.map((player) => {
              const blocked = sanctioned.has(player.playerId);
              return (
                <li key={player.playerId}>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => add(player)}
                    title={blocked ? "Suspendido: no puede ser titular" : `Agregar a ${player.firstName} ${player.lastName}`}
                    className={cn(
                      "flex min-h-10 items-center gap-2 rounded-md border px-2.5 text-sm hover:bg-[var(--sheet-bg-alt)]",
                      blocked && "cursor-not-allowed opacity-50 line-through",
                    )}
                    style={{ borderColor: "var(--sheet-line-strong)" }}
                  >
                    <span className="w-6 text-center text-xs tabular-nums" style={{ color: "var(--sheet-muted)" }}>
                      {player.jerseyNumber ?? "—"}
                    </span>
                    <span>
                      {player.lastName}, {player.firstName}
                    </span>
                    {player.position && <PositionBadge code={player.position} size="xs" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export function LineupBuilder({
  homeTeam,
  awayTeam,
  rules,
  rulesSource,
  initialLineups,
  previousLineups,
  sanctionedPlayerIds,
  busy,
  error,
  demoMode,
  onConfirm,
}: LineupBuilderProps) {
  const sanctioned = useMemo(() => new Set(sanctionedPlayerIds), [sanctionedPlayerIds]);
  const [away, setAway] = useState<Row[]>(() => rowsFromInput(initialLineups?.[awayTeam.id]));
  const [home, setHome] = useState<Row[]>(() => rowsFromInput(initialLineups?.[homeTeam.id]));

  const awayCheck = validate(away, rules);
  const homeCheck = validate(home, rules);
  const ready = away.length > 0 && home.length > 0 && awayCheck.errors.length === 0 && homeCheck.errors.length === 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-4 px-3 py-4 sm:px-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl">Preparar el partido</h1>
          <p className="text-sm text-muted-foreground">
            Visitante <strong className="text-foreground">{awayTeam.name}</strong> · Local{" "}
            <strong className="text-foreground">{homeTeam.name}</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-brand-silver/30 px-2.5 py-1">
            Reglas: {rules.name} · {rules.innings} entradas · hasta {rules.maxBatters} bateadores · {rules.fielders} defensivos
            {rulesSource === "default" && " · por omisión"}
          </span>
          {demoMode && <span className="rounded-full border border-brand-amber/50 px-2.5 py-1 text-brand-amber">Modo demo</span>}
        </div>
      </header>

      <p className="text-sm text-muted-foreground">
        Agrega jugadores desde la banca en su orden al bate, asigna posición (P, C, 1B, 2B, 3B, SS, LF, CF, RF{rules.fielders >= 10 ? ", SF" : ""}) y marca EP a quien solo batea. Las posiciones se pueden cambiar durante el partido.
      </p>

      <div className="flex flex-col gap-4 lg:flex-row">
        <TeamEditor team={awayTeam} rows={away} rules={rules} sanctioned={sanctioned} previous={previousLineups?.[awayTeam.id]} onChange={setAway} />
        <TeamEditor team={homeTeam} rows={home} rules={rules} sanctioned={sanctioned} previous={previousLineups?.[homeTeam.id]} onChange={setHome} />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 p-3 backdrop-blur">
        <p className="text-sm text-muted-foreground">
          {ready
            ? `Listo: ${away.filter((r) => r.role !== "FLEX").length} vs ${home.filter((r) => r.role !== "FLEX").length} bateadores. Abre la visita.`
            : "Completa ambas alineaciones para iniciar."}
        </p>
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => onConfirm({ [awayTeam.id]: toInput(away), [homeTeam.id]: toInput(home) })}
          className="min-h-12 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
        >
          {busy ? "Iniciando…" : "Iniciar partido"}
        </button>
      </div>
    </main>
  );
}

export { POSITIONS as LINEUP_POSITIONS };
