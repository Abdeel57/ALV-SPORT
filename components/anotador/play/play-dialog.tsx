"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  POSITIONS,
  baseName,
  buildPlay,
  buildRunnerMoves,
  findEntry,
  outMenu,
  proposeRunners,
  reachMenu,
  runnerOptions,
  type BuiltPlay,
  type CatalogEntry,
  type MenuGroup,
  type OccupiedBase,
  type RunnerState,
  type PlayDraft,
  type RunnerDecision,
  type RunnerMoveReason,
  type ScorebookStateInternal,
} from "@/lib/engine/scorebook";
import { cn } from "@/lib/utils";
import { useShortcuts, type ShortcutMap } from "../hooks/use-shortcuts";
import { BasesDiamond } from "../ui/bases-diamond";
import { PanelButton, SidePanel } from "../ui/side-panel";

/**
 * Ventana única de captura con pasos internos:
 *   acción → detalle (secuencia / error / tipo) → corredores → resumen.
 * Las jugadas frecuentes con bases vacías van directo al resumen (Enter
 * confirma). Los casos complejos solo piden sus datos adicionales.
 */

export type PlayDialogMode = "out" | "reach" | "runners";

export interface PlayDialogProps {
  state: ScorebookStateInternal;
  mode: PlayDialogMode;
  batterId: string;
  playerNames: Record<string, string>;
  shortcutsEnabled: boolean;
  onCommit: (built: BuiltPlay) => void;
  onClose: () => void;
}

type Step = "action" | "detail" | "runners" | "summary";
type CustomKind = NonNullable<PlayDraft["customKind"]>;

const CUSTOM_KINDS: { kind: CustomKind; label: string; prefix: string }[] = [
  { kind: "ground", label: "Rodado", prefix: "" },
  { kind: "fly", label: "Elevado", prefix: "F" },
  { kind: "line", label: "Línea", prefix: "L" },
  { kind: "popup", label: "Elevado al cuadro", prefix: "P" },
  { kind: "foul_fly", label: "Foul atrapado", prefix: "FF" },
];

const RUNNER_REASONS: { reason: RunnerMoveReason; label: string; needsStealing?: boolean; needsError?: boolean }[] = [
  { reason: "stolen_base", label: "Robo de base", needsStealing: true },
  { reason: "caught_stealing", label: "Out robando", needsStealing: true },
  { reason: "wild_pitch", label: "Lanzamiento descontrolado" },
  { reason: "passed_ball", label: "Passed ball" },
  { reason: "pickoff", label: "Pickoff (corredor out)" },
  { reason: "error", label: "Avance por error", needsError: true },
  { reason: "balk", label: "Balk" },
  { reason: "defensive_indifference", label: "Indiferencia defensiva" },
  { reason: "manual", label: "Otro movimiento" },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border px-1 font-mono text-[10px] leading-4" style={{ borderColor: "var(--sheet-line-strong)", color: "var(--sheet-muted)" }} aria-hidden>
      {children}
    </kbd>
  );
}

function FielderPicker({
  label,
  value,
  onChange,
  max,
  multiple,
}: {
  label: string;
  value: number[];
  onChange: (next: number[]) => void;
  max: number;
  multiple: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>
        {label}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {POSITIONS.filter((p) => p.number <= max).map((position) => {
          const active = value.includes(position.number);
          return (
            <button
              key={position.code}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (multiple) onChange([...value, position.number]);
                else onChange(active ? [] : [position.number]);
              }}
              className={cn("flex min-h-10 min-w-12 flex-col items-center justify-center rounded-md border px-2 text-xs font-semibold", active && "text-white")}
              style={{ borderColor: "var(--sheet-line-strong)", backgroundColor: active ? "var(--sheet-ink)" : "transparent" }}
              title={position.label}
            >
              <span className="font-display text-base leading-none">{position.number}</span>
              <span>{position.code}</span>
            </button>
          );
        })}
        {multiple && value.length > 0 && (
          <button type="button" onClick={() => onChange(value.slice(0, -1))} className="min-h-10 rounded-md border px-3 text-xs" style={{ borderColor: "var(--sheet-line-strong)" }}>
            ← Borrar (Retroceso)
          </button>
        )}
      </div>
      {multiple && (
        <p className="font-display text-2xl tabular-nums" aria-live="polite">
          {value.length ? value.join("-") : "—"}
        </p>
      )}
    </fieldset>
  );
}

function toneFor(entry: CatalogEntry): string {
  if (entry.result === "out" || entry.result === "strikeout" || entry.result === "sac_fly" || entry.result === "sac_bunt") return "var(--sheet-out)";
  if (entry.result === "walk" || entry.result === "intentional_walk" || entry.result === "hbp" || entry.result === "interference") return "var(--sheet-walk)";
  if (entry.result === "reach_on_error" || entry.result === "fielders_choice") return "var(--sheet-error)";
  return "var(--sheet-hit)";
}

/** Entradas que piden un dato adicional antes de resolver corredores. */
function needsDetail(entry: CatalogEntry): boolean {
  return (
    entry.sequence === "required" ||
    entry.sequence === "editable" ||
    !!entry.needsErrorFielder ||
    entry.kind === "double_play" ||
    entry.kind === "triple_play" ||
    (entry.result === "strikeout" && !entry.kind)
  );
}

function MenuGroups({
  groups,
  onPick,
  selectedKey,
}: {
  groups: MenuGroup[];
  onPick: (entry: CatalogEntry) => void;
  selectedKey: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        const compact = group.def.group.endsWith("_out") && group.def.group !== "special_out";
        return (
          <section key={group.def.group} aria-labelledby={`grp-${group.def.group}`}>
            <h3 id={`grp-${group.def.group}`} className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>
              {group.def.label}
              {group.def.hint && <span className="ml-1 normal-case tracking-normal"> · {group.def.hint}</span>}
            </h3>
            <div className={cn("grid gap-1.5", compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-2")}>
              {group.entries.map(({ entry, available, reason }) => (
                <button
                  key={entry.key}
                  type="button"
                  disabled={!available}
                  onClick={() => onPick(entry)}
                  title={available ? entry.description ?? entry.label : (reason ?? "No disponible")}
                  aria-pressed={selectedKey === entry.key}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-md border px-2 py-1 text-left hover:bg-[var(--sheet-bg-alt)] disabled:cursor-not-allowed disabled:opacity-40",
                    compact ? "text-xs" : "text-sm",
                    selectedKey === entry.key && "ring-2 ring-[var(--sheet-select)]",
                  )}
                  style={{ borderColor: "var(--sheet-line-strong)" }}
                >
                  <span className="min-w-8 shrink-0 rounded px-1 text-center text-[11px] font-bold text-white tabular-nums" style={{ backgroundColor: toneFor(entry) }}>
                    {entry.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block font-medium", compact ? "leading-tight" : "truncate")}>{entry.label}</span>
                    {!available && reason && <span className="block truncate text-[10px]" style={{ color: "var(--sheet-muted)" }}>{reason}</span>}
                  </span>
                  {entry.shortcut && <Kbd>{entry.shortcut}</Kbd>}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function PlayDialog({ state, mode, batterId, playerNames, shortcutsEnabled, onCommit, onClose }: PlayDialogProps) {
  const runnersOnBase = useMemo(() => {
    const list: { base: OccupiedBase; runner: RunnerState }[] = [];
    for (const base of [3, 2, 1] as const) {
      const runner = state.bases[base];
      if (runner) list.push({ base, runner });
    }
    return list;
  }, [state.bases]);
  const ctx = useMemo(() => ({ rules: state.rules, outs: state.outs, runnersOn: runnersOnBase.map((r) => r.base) }), [state.rules, state.outs, runnersOnBase]);

  const [tab, setTab] = useState<"out" | "reach">(mode === "reach" ? "reach" : "out");
  const [step, setStep] = useState<Step>(mode === "runners" ? "runners" : "action");
  const [entryKey, setEntryKey] = useState<string | null>(null);
  const [customKind, setCustomKind] = useState<CustomKind>("ground");
  const [sequence, setSequence] = useState<number[]>([]);
  const [errorFielder, setErrorFielder] = useState<number | null>(null);
  const [strikeoutKind, setStrikeoutKind] = useState<"swinging" | "looking">("swinging");
  const [runners, setRunners] = useState<RunnerDecision[]>([]);
  const [rbi, setRbi] = useState<number | null>(null);
  const [earned, setEarned] = useState<Record<string, boolean | null>>({});
  const [runnerReason, setRunnerReason] = useState<RunnerMoveReason>(state.rules.stealingAllowed ? "stolen_base" : "wild_pitch");
  const [runnerErrorFielder, setRunnerErrorFielder] = useState<number | null>(null);

  const entry: CatalogEntry | null = useMemo(() => {
    if (entryKey === "custom") return null;
    return entryKey ? findEntry(entryKey) : null;
  }, [entryKey]);

  const outGroups = useMemo(() => outMenu(ctx), [ctx]);
  const reachGroups = useMemo(() => reachMenu(ctx), [ctx]);

  const person = useCallback((id: string) => playerNames[id] ?? "jugador", [playerNames]);

  // Inicializa corredores para el modo "runners" (todos se quedan).
  useEffect(() => {
    if (mode === "runners") {
      setRunners(runnersOnBase.map((r) => ({ playerId: r.runner.playerId, from: r.base, action: "stay" })));
    }
  }, [mode, runnersOnBase]);

  const draft: PlayDraft | null = useMemo(() => {
    if (mode === "runners") return null;
    if (!entryKey) return null;
    if (entryKey === "custom") {
      return { entryKey: "custom", customKind, batterId, fielders: sequence, runners, rbi, earned };
    }
    return {
      entryKey,
      batterId,
      fielders: entry?.sequence === "fixed" ? undefined : sequence.length > 0 ? sequence : undefined,
      errorFielder,
      runners,
      rbi,
      earned,
      strikeoutKind,
    };
  }, [mode, entryKey, customKind, batterId, sequence, runners, rbi, earned, errorFielder, strikeoutKind, entry]);

  const built: BuiltPlay | null = useMemo(() => {
    if (mode === "runners") {
      return buildRunnerMoves(state, { reason: runnerReason, decisions: runners, errorFielder: runnerErrorFielder }, { playerNames });
    }
    return draft ? buildPlay(state, draft, { playerNames }) : null;
  }, [mode, state, draft, playerNames, runnerReason, runners, runnerErrorFielder]);

  const pickEntry = useCallback(
    (picked: CatalogEntry | "custom") => {
      if (picked === "custom") {
        setEntryKey("custom");
        setSequence([]);
        setStep("detail");
        return;
      }
      setEntryKey(picked.key);
      setSequence(picked.sequence === "editable" ? [...(picked.fielders ?? [])] : []);
      setErrorFielder(null);
      setRbi(null);
      setEarned({});
      const proposals = proposeRunners(state, picked);
      setRunners(proposals);
      if (needsDetail(picked)) setStep("detail");
      else if (runnersOnBase.length > 0) setStep("runners");
      else setStep("summary");
    },
    [state, runnersOnBase.length],
  );

  const nextFromDetail = useCallback(() => {
    if (runnersOnBase.length > 0) setStep("runners");
    else setStep("summary");
  }, [runnersOnBase.length]);

  const confirm = useCallback(() => {
    if (built?.ok) onCommit(built);
  }, [built, onCommit]);

  const detailApplies = entryKey === "custom" || (entry !== null && needsDetail(entry));
  const back = useCallback(() => {
    if (mode === "runners") return;
    if (step === "summary") setStep(runnersOnBase.length > 0 ? "runners" : detailApplies ? "detail" : "action");
    else if (step === "runners") setStep(detailApplies ? "detail" : "action");
    else if (step === "detail") setStep("action");
  }, [step, runnersOnBase.length, detailApplies, mode]);

  const setDecision = useCallback((playerId: string, patch: Partial<RunnerDecision>) => {
    setRunners((current) => current.map((d) => (d.playerId === playerId ? { ...d, ...patch } : d)));
  }, []);
  const allHold = useCallback(() => setRunners((current) => current.map((d) => (d.forced ? d : { ...d, action: "stay", to: undefined, onError: undefined }))), []);
  const allScore = useCallback(() => setRunners((current) => current.map((d) => ({ ...d, action: "score", to: 4, reason: d.reason ?? "hit" }))), []);

  // --- Atajos dentro del panel ---
  const shortcuts = useMemo<ShortcutMap>(() => {
    const map: ShortcutMap = {
      ESC: onClose,
    };
    if (step === "action") {
      const groups = tab === "out" ? outGroups : reachGroups;
      for (const group of groups) {
        for (const { entry: e, available } of group.entries) {
          if (e.shortcut && available) map[e.shortcut.toUpperCase()] = () => pickEntry(e);
        }
      }
      map.O = () => setTab("out");
      map.H = () => setTab("reach");
    }
    if (step === "detail") {
      for (let n = 1; n <= 9; n += 1) map[String(n)] = () => setSequence((s) => [...s, n]);
      map["0"] = () => setSequence((s) => [...s, 10]);
      map.BACKSPACE = () => setSequence((s) => s.slice(0, -1));
      map.ENTER = () => nextFromDetail();
    }
    if (step === "runners") {
      map.Q = allHold;
      map.A = allScore;
      map.ENTER = () => setStep("summary");
    }
    if (step === "summary") {
      map.ENTER = confirm;
    }
    return map;
  }, [step, tab, outGroups, reachGroups, pickEntry, nextFromDetail, allHold, allScore, confirm, onClose]);

  useShortcuts(shortcuts, { enabled: shortcutsEnabled, allowInInputs: ["ESC", "ENTER"] });

  const title = mode === "runners" ? "Corredores" : mode === "reach" ? "Llegada a base" : "Out";
  const subtitle = mode === "runners" ? `${runnersOnBase.length} en base · ${state.outs} out(s)` : `${person(batterId)} al bate · ${state.outs} out(s) · cuenta ${state.balls}-${state.strikes}`;

  const stepLabel: Record<Step, string> = { action: "1 · Acción", detail: "2 · Detalle", runners: "3 · Corredores", summary: "4 · Resumen" };

  return (
    <SidePanel title={title} subtitle={subtitle} onClose={onClose} width="xl" describedBy="play-step">
      <p id="play-step" className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>
        {(mode === "runners" ? (["runners", "summary"] as Step[]) : (["action", "detail", "runners", "summary"] as Step[])).map((s) => (
          <span key={s} className={cn("rounded-full border px-2 py-0.5", s === step && "text-white")} style={{ borderColor: "var(--sheet-line-strong)", backgroundColor: s === step ? "var(--sheet-ink)" : "transparent" }}>
            {stepLabel[s]}
          </span>
        ))}
      </p>

      {step === "action" && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5" role="tablist" aria-label="Tipo de jugada">
            {(["out", "reach"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn("min-h-10 flex-1 rounded-md border px-3 text-sm font-semibold", tab === t && "text-white")}
                style={{ borderColor: "var(--sheet-line-strong)", backgroundColor: tab === t ? (t === "out" ? "var(--sheet-out)" : "var(--sheet-hit)") : "transparent" }}
              >
                {t === "out" ? "Outs" : "Llegada a base"} <Kbd>{t === "out" ? "O" : "H"}</Kbd>
              </button>
            ))}
          </div>
          {tab === "out" ? (
            <MenuGroups groups={outGroups} onPick={(e) => (e.key === "out.batted.custom" ? pickEntry("custom") : pickEntry(e))} selectedKey={entryKey} />
          ) : (
            <MenuGroups groups={reachGroups} onPick={pickEntry} selectedKey={entryKey} />
          )}
        </div>
      )}

      {step === "detail" && (
        <div className="flex flex-col gap-4">
          {entryKey === "custom" && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>Tipo de batazo</legend>
              <div className="flex flex-wrap gap-1.5">
                {CUSTOM_KINDS.map((k) => (
                  <button key={k.kind} type="button" aria-pressed={customKind === k.kind} onClick={() => setCustomKind(k.kind)} className={cn("min-h-10 rounded-md border px-3 text-sm", customKind === k.kind && "text-white")} style={{ borderColor: "var(--sheet-line-strong)", backgroundColor: customKind === k.kind ? "var(--sheet-ink)" : "transparent" }}>
                    {k.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {(entryKey === "custom" || (entry && entry.sequence !== "fixed")) && (
            <FielderPicker label="Secuencia defensiva (teclea los números; Enter para seguir)" value={sequence} onChange={setSequence} max={state.rules.fielders} multiple />
          )}
          {entry?.needsErrorFielder && (
            <FielderPicker label="Fildeador que cometió el error" value={errorFielder ? [errorFielder] : []} onChange={(v) => setErrorFielder(v[0] ?? null)} max={state.rules.fielders} multiple={false} />
          )}
          {entry?.result === "strikeout" && !entry.kind && (
            <fieldset className="flex gap-1.5">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>Tipo de ponche</legend>
              {(["swinging", "looking"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={strikeoutKind === k} onClick={() => setStrikeoutKind(k)} className={cn("min-h-10 rounded-md border px-3 text-sm", strikeoutKind === k && "text-white")} style={{ borderColor: "var(--sheet-line-strong)", backgroundColor: strikeoutKind === k ? "var(--sheet-ink)" : "transparent" }}>
                  {k === "swinging" ? "Tirándole" : "Cantado"}
                </button>
              ))}
            </fieldset>
          )}
          {(entry?.kind === "double_play" || entry?.kind === "triple_play") && (
            <p className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: "var(--sheet-run)", backgroundColor: "var(--sheet-active)" }}>
              En el siguiente paso marca al corredor (o corredores) puesto out y en qué base.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <PanelButton variant="secondary" onClick={back}>Atrás</PanelButton>
            <PanelButton variant="primary" onClick={nextFromDetail} shortcut="Enter" autoFocus>Siguiente</PanelButton>
          </div>
        </div>
      )}

      {step === "runners" && (
        <div className="flex flex-col gap-4">
          {mode === "runners" && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>Motivo</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {RUNNER_REASONS.map((r) => {
                  const blocked = r.needsStealing && !state.rules.stealingAllowed;
                  return (
                    <button key={r.reason} type="button" disabled={blocked} aria-pressed={runnerReason === r.reason} onClick={() => setRunnerReason(r.reason)} title={blocked ? "El robo no está permitido en esta modalidad" : r.label} className={cn("min-h-10 rounded-md border px-2 text-left text-sm disabled:opacity-40", runnerReason === r.reason && "text-white")} style={{ borderColor: "var(--sheet-line-strong)", backgroundColor: runnerReason === r.reason ? "var(--sheet-ink)" : "transparent" }}>
                      {r.label}
                    </button>
                  );
                })}
              </div>
              {runnerReason === "error" && (
                <FielderPicker label="Fildeador del error" value={runnerErrorFielder ? [runnerErrorFielder] : []} onChange={(v) => setRunnerErrorFielder(v[0] ?? null)} max={state.rules.fielders} multiple={false} />
              )}
            </fieldset>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <BasesDiamond bases={state.bases} outs={state.outs} playerNames={playerNames} size={150} className="shrink-0 self-center" />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {runnersOnBase.length === 0 && <p style={{ color: "var(--sheet-muted)" }}>No hay corredores en base.</p>}
              {runnersOnBase.map(({ base, runner }) => {
                const decision = runners.find((d) => d.playerId === runner.playerId);
                const options = runnerOptions(base);
                return (
                  <fieldset key={runner.playerId} className="rounded-lg border p-2.5" style={{ borderColor: decision?.forced ? "var(--sheet-walk)" : "var(--sheet-line-strong)" }}>
                    <legend className="px-1 text-sm font-semibold">
                      {person(runner.playerId)} <span style={{ color: "var(--sheet-muted)" }}>en {baseName(base)}</span>
                      {decision?.forced && <span className="ml-1 text-[10px] uppercase" style={{ color: "var(--sheet-walk)" }}>forzado</span>}
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      {options.map((option) => {
                        const active = decision?.action === option.action && (option.action === "stay" || decision?.to === option.to);
                        return (
                          <label key={`${option.action}-${option.to ?? 0}`} className={cn("inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs", active && "text-white", decision?.forced && "cursor-not-allowed opacity-60")} style={{ borderColor: "var(--sheet-line-strong)", backgroundColor: active ? (option.action === "out" ? "var(--sheet-out)" : option.action === "score" ? "var(--sheet-run)" : "var(--sheet-ink)") : "transparent" }}>
                            <input type="radio" name={`runner-${runner.playerId}`} className="sr-only" checked={!!active} disabled={decision?.forced} onChange={() => setDecision(runner.playerId, { action: option.action, to: option.to, reason: option.action === "out" ? "tag" : decision?.reason ?? (mode === "runners" ? undefined : "hit") })} />
                            {option.label}
                          </label>
                        );
                      })}
                    </div>
                    {decision && decision.action !== "stay" && decision.action !== "out" && mode !== "runners" && (
                      <label className="mt-2 flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={!!decision.onError} onChange={(e) => setDecision(runner.playerId, { onError: e.target.checked, reason: e.target.checked ? "error" : "hit" })} className="size-4" />
                        Avanzó por error de la defensa
                      </label>
                    )}
                    {decision?.onError && mode !== "runners" && (
                      <div className="mt-2">
                        <FielderPicker label="Fildeador del error" value={decision.errorFielder ? [decision.errorFielder] : []} onChange={(v) => setDecision(runner.playerId, { errorFielder: v[0] ?? null })} max={state.rules.fielders} multiple={false} />
                      </div>
                    )}
                    {decision?.action === "out" && (
                      <div className="mt-2">
                        <FielderPicker label="Quiénes hicieron el out" value={decision.fielders ?? []} onChange={(v) => setDecision(runner.playerId, { fielders: v })} max={state.rules.fielders} multiple />
                      </div>
                    )}
                  </fieldset>
                );
              })}
              {runnersOnBase.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <PanelButton variant="secondary" onClick={allHold} shortcut="Q">Todos se quedan</PanelButton>
                  <PanelButton variant="secondary" onClick={allScore} shortcut="A">Todos anotan</PanelButton>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {mode !== "runners" && <PanelButton variant="secondary" onClick={back}>Atrás</PanelButton>}
            <PanelButton variant="primary" onClick={() => setStep("summary")} shortcut="Enter" autoFocus>Revisar</PanelButton>
          </div>
        </div>
      )}

      {step === "summary" && built && (
        <div className="flex flex-col gap-4">
          <p className="rounded-lg border px-3 py-2 text-base leading-snug" style={{ borderColor: "var(--sheet-line-strong)", backgroundColor: "var(--sheet-bg-alt)" }} aria-live="polite">
            {built.summary || "Sin cambios"}
          </p>
          {mode !== "runners" && (
            <label className="flex items-center gap-3 text-sm">
              <span className="font-semibold">Impulsadas</span>
              <input
                type="number"
                min={0}
                max={4}
                value={rbi ?? built.proposedRbi}
                onChange={(e) => setRbi(Math.max(0, Math.min(4, Number(e.target.value) || 0)))}
                className="w-16 rounded-md border bg-transparent px-2 py-1 text-center tabular-nums"
                style={{ borderColor: "var(--sheet-line-strong)" }}
                aria-describedby="rbi-hint"
              />
              <span id="rbi-hint" className="text-xs" style={{ color: "var(--sheet-muted)" }}>propuesta: {built.proposedRbi}</span>
            </label>
          )}
          {mode !== "runners" && runners.filter((d) => d.action === "score").length + (entry?.result === "home_run" ? 1 : 0) > 0 && (
            <fieldset className="flex flex-col gap-1.5 text-sm">
              <legend className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>Carreras: limpia o sucia</legend>
              {[...(entry?.result === "home_run" ? [batterId] : []), ...runners.filter((d) => d.action === "score").map((d) => d.playerId)].map((playerId) => (
                <div key={playerId} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-32 truncate">{person(playerId)}</span>
                  {([
                    [true, "Limpia"],
                    [false, "Sucia"],
                    [null, "Decidir después"],
                  ] as const).map(([value, label]) => (
                    <button key={label} type="button" aria-pressed={earned[playerId] === value} onClick={() => setEarned((e) => ({ ...e, [playerId]: value }))} className={cn("min-h-9 rounded-md border px-2 text-xs", earned[playerId] === value && "text-white")} style={{ borderColor: "var(--sheet-line-strong)", backgroundColor: earned[playerId] === value ? "var(--sheet-ink)" : "transparent" }}>
                      {label}
                    </button>
                  ))}
                </div>
              ))}
              <p className="text-xs" style={{ color: "var(--sheet-muted)" }}>Sin elegir, el sistema propone limpia salvo que haya error en la entrada.</p>
            </fieldset>
          )}
          {built.errors.length > 0 && (
            <ul className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--sheet-out)", color: "var(--sheet-out)" }} role="alert">
              {built.errors.map((e) => (
                <li key={e}>● {e}</li>
              ))}
            </ul>
          )}
          {built.warnings.length > 0 && (
            <ul className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: "var(--sheet-error)", color: "var(--sheet-error)" }}>
              {built.warnings.map((w) => (
                <li key={w}>● {w}</li>
              ))}
            </ul>
          )}
          {built.endsHalfInning && (
            <p className="text-xs font-semibold" style={{ color: "var(--sheet-out)" }}>Tercer out: al confirmar cambia la media entrada y se limpian las bases.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <PanelButton variant="secondary" onClick={back}>Atrás</PanelButton>
            <PanelButton variant="secondary" onClick={onClose} shortcut="Esc">Cancelar</PanelButton>
            <PanelButton variant="primary" onClick={confirm} disabled={!built.ok} shortcut="Enter" autoFocus>Confirmar jugada</PanelButton>
          </div>
        </div>
      )}
    </SidePanel>
  );
}
