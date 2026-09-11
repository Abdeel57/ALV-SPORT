"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { EngineGameEvent } from "@/lib/engine";
import {
  buildCorrection,
  buildDefensiveChange,
  buildHalfInningEnd,
  buildPitch,
  buildSubstitution,
  nextBatter,
  reduceScorebook,
  type BuiltPlay,
  type InitialLineup,
  type PlateAppearance,
  type SubstitutionDraft,
} from "@/lib/engine/scorebook";
import {
  connectionStatus,
  createQueueStore,
  createSyncEngine,
  deleteQueuedEvents,
  loadGameMeta,
  loadQueuedEvents,
  pendingCount as countPending,
  pendingEvents,
  persistGameMeta,
  persistQueuedEvents,
  type GameMeta,
  type QueuedEventInput,
  type SyncEngine,
} from "@/lib/offline";
import { createHttpUploader } from "@/lib/offline/http-uploader";
import { cn } from "@/lib/utils";
import { HowToPanel } from "./help/how-to";
import { useShortcuts, type ShortcutMap } from "./hooks/use-shortcuts";
import { HistoryPanel } from "./panels/history-panel";
import { ReportPanel } from "./panels/report-panel";
import { SubstitutionPanel } from "./panels/substitution-panel";
import { PlayDialog, type PlayDialogMode } from "./play/play-dialog";
import { ActionBar } from "./scorebook/action-bar";
import { ContextPanel } from "./scorebook/context-panel";
import { ScoreboardStrip } from "./scorebook/scoreboard-strip";
import { ScorebookGrid, type CellRef } from "./scorebook/scorebook-grid";
import { StatusBar } from "./scorebook/status-bar";
import { LineupBuilder } from "./setup/lineup-builder";
import type { ConsoleProps, LineupsInput, ServerEventRow } from "./types";
import { SidePanel } from "./ui/side-panel";

/**
 * Mesa de anotación: orquesta la libreta digital.
 *
 * - Los eventos siguen siendo la fuente de verdad (cola local → servidor).
 * - Todo el estado del partido (bases, outs, cuenta, celdas, marcador,
 *   estadísticas) se deriva con `reduceScorebook` a partir de los eventos
 *   efectivos; aquí no se guarda nada de eso.
 * - Cada jugada se encola completa (`enqueue_many`) y el sync engine nunca
 *   parte una jugada en dos lotes.
 */

type Phase = "setup" | "scoring" | "finished";

type Panel =
  | { kind: "play"; mode: PlayDialogMode }
  | { kind: "history" }
  | { kind: "subs" }
  | { kind: "report" }
  | { kind: "help" }
  | { kind: "issues" }
  | { kind: "context" };

const RETRY_COOLDOWN_MS = 8000;

function mapServerRow(row: ServerEventRow): EngineGameEvent {
  return {
    id: row.id,
    seq: row.seq,
    gameId: row.game_id,
    teamId: row.team_id,
    playerId: row.player_id,
    eventType: row.event_type,
    payload: row.payload ?? {},
    period: row.period,
    clockSeconds: row.clock_seconds,
    correctsEventId: row.corrects_event_id,
  };
}

/**
 * Alineación confirmada → alineación inicial del motor. Un FLEX (defiende sin
 * batear) no ocupa turno, así que no entra en el orden al bate.
 */
function toEngineLineups(lineups: LineupsInput): InitialLineup[] {
  return Object.entries(lineups).map(([teamId, slots]) => ({
    teamId,
    slots: slots.flatMap((slot) =>
      slot.slot === null || slot.role === "FLEX"
        ? []
        : [{ slot: slot.slot, playerId: slot.playerId, position: slot.position, role: slot.role }],
    ),
  }));
}

function lineupsFromMeta(meta: GameMeta): LineupsInput | null {
  if (!meta.lineupSlots) return null;
  const result: LineupsInput = {};
  for (const [teamId, slots] of Object.entries(meta.lineupSlots)) {
    result[teamId] = slots.map((slot) => ({
      playerId: slot.playerId,
      slot: slot.slot,
      position: slot.position,
      role: slot.role === "EP" || slot.role === "DH" || slot.role === "FLEX" ? slot.role : "starter",
    }));
  }
  return result;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = (): void => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function AnotadorConsole(props: ConsoleProps) {
  const { mode, userId, game, homeTeam, awayTeam, rules, rulesSource } = props;
  const isLive = mode === "live";

  // Cola autoritativa FUERA de React: el sync engine necesita lecturas
  // síncronas tras cada dispatch (useReducer haría re-subir lotes).
  const store = useMemo(() => createQueueStore(), []);
  const queue = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  const [phase, setPhase] = useState<Phase>(() =>
    game.status === "finalized" ? "finished" : game.status === "in_progress" ? "scoring" : "setup",
  );
  const [serverEvents, setServerEvents] = useState<ServerEventRow[]>(props.initialEvents);
  const [lineups, setLineups] = useState<LineupsInput>(props.initialLineups ?? {});
  const [hydrated, setHydrated] = useState(false);
  const [online, setOnline] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finalizedElsewhere, setFinalizedElsewhere] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [panel, setPanel] = useState<Panel | null>(null);
  const [pendingUndo, setPendingUndo] = useState(false);
  const [pendingCorrection, setPendingCorrection] = useState<string | null>(null);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [denseChoice, setDenseChoice] = useState<boolean | null>(null);
  const [contextOpen, setContextOpen] = useState(true);
  const [viewTeamId, setViewTeamId] = useState(awayTeam.id);
  const [selectedPaId, setSelectedPaId] = useState<string | null>(null);
  const [focusedCell, setFocusedCell] = useState<CellRef | null>(null);
  const [gridFocus, setGridFocus] = useState(false);

  const smallScreen = useMediaQuery("(max-width: 1400px), (max-height: 820px)");
  const dense = denseChoice ?? smallScreen;

  // --- Nombres y números (para celdas, resúmenes y reportes) ---
  const playerNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const team of [awayTeam, homeTeam]) {
      for (const player of team.roster) {
        names[player.playerId] = `${player.firstName} ${player.lastName}`.trim() || "—";
      }
    }
    return names;
  }, [awayTeam, homeTeam]);
  const jerseyOf = useCallback(
    (playerId: string): string | null => {
      for (const team of [awayTeam, homeTeam]) {
        const player = team.roster.find((p) => p.playerId === playerId);
        if (player) return player.jerseyNumber;
      }
      return null;
    },
    [awayTeam, homeTeam],
  );

  const syncEngine: SyncEngine | null = useMemo(() => {
    if (!isLive) return null;
    return createSyncEngine({ store, upload: createHttpUploader() });
  }, [isLive, store]);

  // Reintentos con enfriamiento: tras un fallo no se martillea al servidor;
  // el intervalo de 8s gobierna los reintentos (force=true lo salta).
  const cooldownUntilRef = useRef(0);
  const requestFlush = useCallback(
    (force = false) => {
      if (!syncEngine) return;
      if (!force && Date.now() < cooldownUntilRef.current) return;
      void syncEngine.flush().then((result) => {
        if (result.error) cooldownUntilRef.current = Date.now() + RETRY_COOLDOWN_MS;
        else if (result.uploaded > 0) setLastSyncedAt(new Date().toISOString());
      });
    },
    [syncEngine],
  );

  // --- Recuperación al montar: IndexedDB primero, servidor como respaldo ---
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let meta: GameMeta | undefined;
      try {
        const [events, storedMeta] = await Promise.all([loadQueuedEvents(game.id), loadGameMeta(game.id)]);
        if (cancelled) return;
        if (events.length > 0) store.dispatch({ type: "hydrate", events });
        meta = storedMeta;
      } catch {
        // IndexedDB no disponible: la mesa sigue funcionando en memoria.
      }
      if (cancelled) return;
      if (meta) {
        // Las alineaciones del servidor mandan; las locales solo cubren el
        // modo demo y el arranque sin conexión.
        const local = lineupsFromMeta(meta);
        if (local && Object.keys(local).length > 0 && Object.keys(props.initialLineups ?? {}).length === 0) {
          setLineups(local);
        }
        // En vivo manda el estado del servidor; la fase local solo cuenta en demo.
        if (!isLive && meta.phase === "scoring" && game.status !== "finalized") setPhase("scoring");
        if (!isLive && meta.phase === "finished") setPhase("finished");
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, store]);

  // --- Línea de tiempo unificada (dedupe por UUID) ---
  const engineEvents = useMemo<EngineGameEvent[]>(() => {
    const serverIds = new Set(serverEvents.map((row) => row.id));
    const maxServerSeq = serverEvents.reduce((max, row) => Math.max(max, row.seq), 0);
    const fromServer = serverEvents.map(mapServerRow);
    const local = queue.events
      .filter((event) => !serverIds.has(event.id))
      .map(
        (event): EngineGameEvent => ({
          id: event.id,
          seq: maxServerSeq + event.localSeq,
          gameId: event.gameId,
          teamId: event.teamId,
          playerId: event.playerId,
          eventType: event.eventType,
          payload: event.payload,
          period: event.period,
          clockSeconds: event.clockSeconds,
          correctsEventId: event.correctsEventId,
        }),
      );
    return [...fromServer, ...local];
  }, [serverEvents, queue.events]);

  const engineLineups = useMemo(() => toEngineLineups(lineups), [lineups]);

  const state = useMemo(
    () =>
      reduceScorebook({
        events: engineEvents,
        rules,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        lineups: engineLineups,
        playerNames,
      }),
    [engineEvents, rules, homeTeam.id, awayTeam.id, engineLineups, playerNames],
  );

  const batter = useMemo(() => nextBatter(state), [state]);
  const lastPlay = state.plays[state.plays.length - 1] ?? null;
  const viewTeam = viewTeamId === homeTeam.id ? homeTeam : awayTeam;

  // La libreta sigue al equipo que batea al cambiar la media entrada.
  useEffect(() => {
    setViewTeamId(state.battingTeamId);
  }, [state.battingTeamId]);

  const activeCell = useMemo<CellRef | null>(() => {
    if (phase !== "scoring" || !batter || viewTeamId !== state.battingTeamId) return null;
    const current = state.currentPA;
    if (current && current.teamId === state.battingTeamId && current.result === null) {
      return { slot: current.slot, inning: current.inning, index: current.indexInInning };
    }
    const book = state.teams[state.battingTeamId]!;
    const prior = book.plateAppearances.filter(
      (pa) => pa.slot === batter.slot && pa.inning === state.inning && !pa.interrupted,
    ).length;
    return { slot: batter.slot, inning: state.inning, index: prior + 1 };
  }, [phase, batter, viewTeamId, state]);

  const selectedPa = useMemo<PlateAppearance | null>(() => {
    if (!selectedPaId) return null;
    for (const team of Object.values(state.teams)) {
      const pa = team.plateAppearances.find((p) => p.id === selectedPaId);
      if (pa) return pa;
    }
    return state.currentPA?.id === selectedPaId ? state.currentPA : null;
  }, [selectedPaId, state]);

  // --- Persistencia continua ---
  useEffect(() => {
    if (!hydrated) return;
    void persistQueuedEvents(queue.events).catch(() => undefined);
  }, [hydrated, queue.events]);

  useEffect(() => {
    if (!hydrated) return;
    const meta: GameMeta = {
      gameId: game.id,
      phase: phase === "setup" ? "lineups" : phase,
      period: state.inning,
      half: state.half,
      lineups: Object.fromEntries(
        Object.entries(lineups).map(([teamId, slots]) => [
          teamId,
          slots
            .filter((slot) => slot.slot !== null)
            .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
            .map((slot) => slot.playerId),
        ]),
      ),
      lineupSlots: lineups,
      activeTeamId: state.battingTeamId,
      updatedAt: new Date().toISOString(),
    };
    void persistGameMeta(meta).catch(() => undefined);
  }, [hydrated, game.id, phase, state.inning, state.half, state.battingTeamId, lineups]);

  // --- Conectividad ---
  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const goOnline = (): void => {
      setOnline(true);
      requestFlush(true);
    };
    const goOffline = (): void => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [requestFlush]);

  // Eventos nuevos (attempts 0) disparan flush inmediato; los reintentos de
  // fallidos quedan en manos del intervalo (con enfriamiento).
  useEffect(() => {
    if (!syncEngine || !online) return;
    if (pendingEvents(queue).some((event) => event.attempts === 0)) requestFlush();
  }, [syncEngine, online, queue, requestFlush]);

  useEffect(() => {
    if (!syncEngine || !online) return;
    const interval = setInterval(() => {
      if (countPending(store.getState()) > 0) requestFlush(true);
    }, RETRY_COOLDOWN_MS);
    return () => clearInterval(interval);
  }, [syncEngine, online, store, requestFlush]);

  // --- En vivo (SSE) + puesta al día ---
  const refetchServerEvents = useCallback(async () => {
    if (!isLive) return;
    try {
      const response = await fetch(`/api/anotador/events?gameId=${encodeURIComponent(game.id)}`, { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { events?: ServerEventRow[] };
      if (body.events) setServerEvents(body.events);
    } catch {
      // Sin conexión: la cola local sigue siendo la fuente de la mesa.
    }
  }, [isLive, game.id]);

  useEffect(() => {
    if (!isLive) return;
    void refetchServerEvents();
    const source = new EventSource(`/api/live/${encodeURIComponent(game.id)}`);
    source.addEventListener("update", (message) => {
      try {
        const update = JSON.parse((message as MessageEvent<string>).data) as {
          events?: ServerEventRow[];
          status?: string | null;
        };
        if (update.events?.length) {
          setServerEvents((prev) => {
            const known = new Set(prev.map((event) => event.id));
            const added = update.events!.filter((event) => !known.has(event.id));
            if (added.length === 0) return prev;
            return [...prev, ...added].sort((a, b) => a.seq - b.seq);
          });
        }
        if (update.status === "finalized" || update.status === "canceled") setFinalizedElsewhere(true);
      } catch {
        // Mensaje ilegible: el siguiente trae el estado completo.
      }
    });
    source.addEventListener("open", () => void refetchServerEvents());
    return () => source.close();
  }, [isLive, game.id, refetchServerEvents]);

  // Poda: eventos synced ya confirmados en el servidor salen de la cola y
  // de IndexedDB (evita crecimiento sin límite a lo largo de la temporada).
  useEffect(() => {
    if (!hydrated) return;
    const serverIds = new Set(serverEvents.map((event) => event.id));
    const confirmed = store
      .getState()
      .events.filter((event) => event.status === "synced" && serverIds.has(event.id))
      .map((event) => event.id);
    if (confirmed.length === 0) return;
    store.dispatch({ type: "prune_synced", ids: confirmed });
    void deleteQueuedEvents(confirmed).catch(() => undefined);
  }, [hydrated, serverEvents, queue, store]);

  // --- Confirmar una jugada: todos sus eventos o ninguno ---
  const commit = useCallback(
    (built: BuiltPlay): boolean => {
      if (!built.ok) {
        setActionError(built.errors.join(" ") || "La jugada no es válida.");
        return false;
      }
      if (built.events.length > 0) {
        const createdAt = new Date().toISOString();
        const inputs: QueuedEventInput[] = built.events.map((event) => ({
          id: event.id,
          gameId: game.id,
          teamId: event.teamId,
          playerId: event.playerId,
          eventType: event.eventType,
          payload: event.payload,
          period: event.period,
          clockSeconds: null,
          correctsEventId: event.correctsEventId,
          createdBy: userId,
          createdAt,
        }));
        store.dispatch({ type: "enqueue_many", events: inputs });
        requestFlush();
      }
      setActionError(null);
      setPendingUndo(false);
      setPendingCorrection(null);
      return true;
    },
    [game.id, userId, store, requestFlush],
  );

  const gameOverMessage = "El partido terminó según las reglas. Finaliza desde Reporte (T) o corrige la última jugada.";

  const handlePitch = useCallback(
    (kind: "ball" | "strike" | "foul") => {
      if (phase !== "scoring" || busy) return;
      if (state.endCondition) {
        setActionError(gameOverMessage);
        return;
      }
      if (!batter) {
        setActionError("No hay bateador: confirma las alineaciones.");
        return;
      }
      commit(buildPitch(state, kind, batter.playerId, { playerNames }));
    },
    [phase, busy, state, batter, commit, playerNames],
  );

  const openPlay = useCallback(
    (playMode: PlayDialogMode) => {
      if (phase !== "scoring" || busy) return;
      if (state.endCondition) {
        setActionError(gameOverMessage);
        return;
      }
      if (!batter) {
        setActionError("No hay bateador: confirma las alineaciones.");
        return;
      }
      if (playMode === "runners" && !state.bases[1] && !state.bases[2] && !state.bases[3]) {
        setActionError("No hay corredores en base.");
        return;
      }
      setPendingUndo(false);
      setPanel({ kind: "play", mode: playMode });
    },
    [phase, busy, state, batter],
  );

  const closePanel = useCallback(() => {
    setPanel(null);
    setPanelError(null);
    setPendingCorrection(null);
  }, []);

  const handleUndo = useCallback(() => {
    if (!lastPlay || phase !== "scoring") return;
    if (pendingUndo) {
      commit(buildCorrection(state, lastPlay.playId, { playerNames }));
      return;
    }
    setPendingUndo(true);
  }, [lastPlay, phase, pendingUndo, commit, state, playerNames]);

  const confirmCorrection = useCallback(() => {
    if (!pendingCorrection) return;
    if (commit(buildCorrection(state, pendingCorrection, { playerNames }))) {
      setSelectedPaId(null);
    }
  }, [pendingCorrection, commit, state, playerNames]);

  const requestCorrection = useCallback((playId: string) => {
    setPendingCorrection(playId);
    setPanel({ kind: "history" });
  }, []);

  const handleSubstitute = useCallback(
    (draft: SubstitutionDraft) => {
      const built = buildSubstitution(state, draft, { playerNames });
      if (!built.ok) {
        setPanelError(built.errors.join(" "));
        return;
      }
      commit(built);
      closePanel();
    },
    [state, playerNames, commit, closePanel],
  );

  const handleDefensiveChange = useCallback(
    (teamId: string, changes: { playerId: string; position: string | null }[]) => {
      const built = buildDefensiveChange(state, teamId, changes, { playerNames });
      if (!built.ok) {
        setPanelError(built.errors.join(" "));
        return;
      }
      commit(built);
      closePanel();
    },
    [state, playerNames, commit, closePanel],
  );

  const handleEndHalfInning = useCallback(
    (reason: "run_limit" | "time" | "manual") => {
      const built = buildHalfInningEnd(state, reason, { playerNames });
      if (!built.ok) {
        setPanelError(built.errors.join(" "));
        return;
      }
      commit(built);
      closePanel();
    },
    [state, playerNames, commit, closePanel],
  );

  const handleConfirmLineups = useCallback(
    async (confirmed: LineupsInput) => {
      setActionError(null);
      if (isLive && typeof navigator !== "undefined" && !navigator.onLine) {
        setActionError(
          "Necesitas conexión a internet para iniciar el partido. Una vez iniciado, la anotación funciona sin conexión.",
        );
        return;
      }
      setBusy(true);
      try {
        if (isLive) {
          // El servidor reemplaza las alineaciones e inicia el partido en una
          // sola transacción (start_game sigue siendo idempotente).
          const response = await fetch("/api/anotador/game", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start", gameId: game.id, lineups: confirmed }),
          });
          if (!response.ok) {
            const detail = (await response.json().catch(() => null)) as { error?: string } | null;
            throw new Error(detail?.error ?? `Error ${response.status}`);
          }
        }
        setLineups(confirmed);
        setPhase("scoring");
        setViewTeamId(awayTeam.id);
      } catch (error) {
        setActionError(error instanceof Error ? `No se pudo iniciar el partido: ${error.message}` : "No se pudo iniciar el partido");
      } finally {
        setBusy(false);
      }
    },
    [isLive, game.id, awayTeam.id],
  );

  const handleFinalize = useCallback(async () => {
    setPanelError(null);
    setBusy(true);
    try {
      if (isLive) {
        if (!syncEngine) throw new Error("La base de datos no está configurada");
        // Antes de finalizar, TODOS los eventos deben estar en el servidor.
        for (let attempt = 0; attempt < 3; attempt += 1) {
          if (countPending(store.getState()) === 0) break;
          const result = await syncEngine.flush();
          if (result.error) throw new Error(`No se pudieron sincronizar los eventos pendientes (${result.error})`);
        }
        if (countPending(store.getState()) > 0) throw new Error("Aún hay eventos pendientes de sincronizar");
        const response = await fetch("/api/anotador/game", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "finalize", gameId: game.id }),
        });
        if (!response.ok) {
          const detail = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(detail?.error ?? `Error ${response.status}`);
        }
      }
      setPhase("finished");
      closePanel();
    } catch (error) {
      setPanelError(error instanceof Error ? `No se pudo finalizar: ${error.message}` : "No se pudo finalizar");
    } finally {
      setBusy(false);
    }
  }, [isLive, syncEngine, game.id, store, closePanel]);

  // --- Atajos globales (solo sin panel abierto) ---
  const globalShortcuts = useMemo<ShortcutMap>(() => {
    const map: ShortcutMap = {
      I: () => setPanel({ kind: "history" }),
      T: () => setPanel({ kind: "report" }),
      "?": () => setPanel({ kind: "help" }),
      M: () => setFocusMode((value) => !value),
      G: () => setGridFocus(true),
      ESC: () => {
        if (pendingUndo) setPendingUndo(false);
        else if (selectedPaId) setSelectedPaId(null);
        else if (actionError) setActionError(null);
      },
    };
    if (phase === "scoring") {
      map.B = () => handlePitch("ball");
      map.S = () => handlePitch("strike");
      map.F = () => handlePitch("foul");
      map.O = () => openPlay("out");
      map.H = () => openPlay("reach");
      map.J = () => openPlay("out");
      map.R = () => openPlay("runners");
      map.U = handleUndo;
      map.C = () => setPanel({ kind: "subs" });
      map.ENTER = () => {
        if (pendingUndo) handleUndo();
      };
    }
    return map;
  }, [phase, pendingUndo, selectedPaId, actionError, handlePitch, openPlay, handleUndo]);
  useShortcuts(globalShortcuts, { enabled: shortcutsEnabled && panel === null });

  // Paneles sin lógica propia de teclado: Esc cierra; Enter confirma anulación.
  const panelShortcuts = useMemo<ShortcutMap>(
    () => ({
      ESC: () => {
        if (pendingCorrection) setPendingCorrection(null);
        else closePanel();
      },
      ENTER: () => {
        if (pendingCorrection) confirmCorrection();
      },
    }),
    [pendingCorrection, closePanel, confirmCorrection],
  );
  useShortcuts(panelShortcuts, { enabled: panel !== null && panel.kind !== "play" });

  useEffect(() => {
    if (!gridFocus) return;
    const timer = setTimeout(() => setGridFocus(false), 100);
    return () => clearTimeout(timer);
  }, [gridFocus]);

  // --- Render ---
  const status = connectionStatus(queue, isLive ? online : false);
  const pending = countPending(queue);
  const syncError = pendingEvents(queue).find((event) => event.lastError)?.lastError ?? null;

  if (finalizedElsewhere && phase !== "finished") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-3xl">Partido finalizado desde otro lugar</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Un administrador finalizó o canceló este partido. La mesa quedó congelada para no registrar eventos que el
          servidor rechazaría.
        </p>
        {pending > 0 && (
          <p className="max-w-md text-sm text-destructive">
            Hay {pending} {pending === 1 ? "evento local" : "eventos locales"} sin sincronizar: contacta al administrador
            de la liga para conciliarlos.
          </p>
        )}
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <LineupBuilder
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        rules={rules}
        rulesSource={rulesSource}
        initialLineups={Object.keys(lineups).length > 0 ? lineups : props.initialLineups}
        previousLineups={props.previousLineups}
        sanctionedPlayerIds={props.sanctionedPlayerIds ?? []}
        busy={busy}
        error={actionError}
        demoMode={!isLive}
        onConfirm={(confirmed) => void handleConfirmLineups(confirmed)}
      />
    );
  }

  const hasLineups = Object.values(state.teams).some((team) => team.slots.length > 0);
  const showContext = contextOpen && !focusMode;
  const contextPanel = (className: string, onClose?: () => void) => (
    <ContextPanel
      state={state}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      playerNames={playerNames}
      jerseyOf={jerseyOf}
      selectedPa={selectedPa}
      onClearSelection={() => setSelectedPaId(null)}
      onCorrectPlay={requestCorrection}
      canCorrect={phase === "scoring"}
      onClose={onClose}
      className={className}
      finished={phase === "finished"}
    />
  );

  return (
    <div className="sheet print-flow flex h-dvh flex-col overflow-hidden">
      <ScoreboardStrip state={state} homeTeam={homeTeam} awayTeam={awayTeam} game={game} phase={phase} compact={dense || focusMode} />

      {phase === "scoring" && (
        <ActionBar
          disabled={busy}
          canUndo={lastPlay !== null}
          undoLabel={lastPlay?.text ?? null}
          focusMode={focusMode}
          shortcutsEnabled={shortcutsEnabled}
          pendingUndo={pendingUndo}
          onPitch={handlePitch}
          onOpenOuts={() => openPlay("out")}
          onOpenReach={() => openPlay("reach")}
          onOpenRunners={() => openPlay("runners")}
          onUndo={handleUndo}
          onOpenSubs={() => setPanel({ kind: "subs" })}
          onOpenHistory={() => setPanel({ kind: "history" })}
          onOpenReport={() => setPanel({ kind: "report" })}
          onOpenHelp={() => setPanel({ kind: "help" })}
          onToggleFocus={() => setFocusMode((value) => !value)}
          onToggleShortcuts={() => setShortcutsEnabled((value) => !value)}
        />
      )}

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col" aria-label="Libreta">
          <div className="print-hide flex flex-wrap items-center gap-2 border-b px-3 py-1.5 text-xs sheet-line">
            <div className="flex gap-1" role="tablist" aria-label="Libreta por equipo">
              {[awayTeam, homeTeam].map((team) => {
                const active = viewTeamId === team.id;
                const batting = state.battingTeamId === team.id && phase === "scoring";
                return (
                  <button
                    key={team.id}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    onClick={() => setViewTeamId(team.id)}
                    className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 font-semibold", active && "text-white")}
                    style={{ borderColor: "var(--sheet-line-strong)", backgroundColor: active ? "var(--sheet-ink)" : "transparent" }}
                  >
                    <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: team.color ?? "#666" }} aria-hidden />
                    {team.name}
                    {batting && <span className="rounded px-1 text-[10px] uppercase" style={{ backgroundColor: "var(--sheet-run)", color: "var(--sheet-ink)" }}>al bate</span>}
                  </button>
                );
              })}
            </div>
            {phase === "finished" && (
              <span className="font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>
                Partido finalizado · solo lectura
              </span>
            )}
            {phase === "scoring" && state.endCondition && (
              <span className="rounded-md px-2 py-1 font-semibold" style={{ backgroundColor: "var(--sheet-active)" }}>
                Fin reglamentario: revisa y finaliza en Reporte (T)
              </span>
            )}
            {phase === "scoring" && !hasLineups && (
              <button type="button" onClick={() => setPhase("setup")} className="rounded-md border px-2 py-1 font-semibold" style={{ borderColor: "var(--sheet-out)", color: "var(--sheet-out)" }}>
                Sin alineaciones: capturarlas ahora
              </button>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {phase === "finished" && (
                <button type="button" onClick={() => setPanel({ kind: "report" })} className="min-h-9 rounded-md border px-2.5 font-semibold" style={{ borderColor: "var(--sheet-line-strong)" }}>
                  Reporte
                </button>
              )}
              <button
                type="button"
                onClick={() => setDenseChoice(!dense)}
                className="min-h-9 rounded-md border px-2.5"
                style={{ borderColor: "var(--sheet-line-strong)", color: "var(--sheet-muted)" }}
                aria-pressed={dense}
                title="Alterna el tamaño de las celdas"
              >
                {dense ? "Celdas: compactas" : "Celdas: amplias"}
              </button>
              <button
                type="button"
                onClick={() => setPanel({ kind: "context" })}
                className="min-h-9 rounded-md border px-2.5 lg:hidden"
                style={{ borderColor: "var(--sheet-line-strong)" }}
              >
                Contexto
              </button>
              {!showContext && !focusMode && (
                <button type="button" onClick={() => setContextOpen(true)} className="hidden min-h-9 rounded-md border px-2.5 lg:inline-flex lg:items-center" style={{ borderColor: "var(--sheet-line-strong)" }}>
                  Mostrar contexto
                </button>
              )}
            </div>
          </div>

          <div className="print-flow grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)]">
            <ScorebookGrid
              state={state}
              team={viewTeam}
              playerNames={playerNames}
              jerseyOf={jerseyOf}
              activeCell={activeCell}
              selectedPaId={selectedPaId}
              onSelectPa={(pa) => setSelectedPaId(pa?.id ?? null)}
              focusedCell={focusedCell}
              onFocusCell={setFocusedCell}
              dense={dense}
              gridFocus={gridFocus}
              className="print-flow"
            />
          </div>

          {actionError && (
            <p role="alert" className="print-hide flex items-center gap-3 border-t px-3 py-1.5 text-xs font-semibold sheet-line" style={{ color: "var(--sheet-out)" }}>
              <span className="min-w-0 flex-1">{actionError}</span>
              <button type="button" onClick={() => setActionError(null)} className="underline">
                Cerrar
              </button>
            </p>
          )}
        </section>

        {showContext && contextPanel("print-hide hidden w-[300px] shrink-0 lg:flex xl:w-[340px]", () => setContextOpen(false))}
      </div>

      <StatusBar
        mode={mode}
        status={status}
        pendingCount={pending}
        syncError={syncError}
        lastSyncedAt={lastSyncedAt}
        issueCount={state.issues.length}
        onOpenHistory={() => setPanel({ kind: "history" })}
        onOpenIssues={() => setPanel({ kind: "issues" })}
      />

      {panel?.kind === "play" && batter && (
        <PlayDialog
          key={`${panel.mode}-${state.lastSeq}-${queue.events.length}`}
          state={state}
          mode={panel.mode}
          batterId={batter.playerId}
          playerNames={playerNames}
          shortcutsEnabled={shortcutsEnabled}
          onCommit={(built) => {
            if (commit(built)) closePanel();
          }}
          onClose={closePanel}
        />
      )}
      {panel?.kind === "history" && (
        <HistoryPanel
          state={state}
          canCorrect={phase === "scoring"}
          pendingCorrection={pendingCorrection}
          onRequestCorrect={setPendingCorrection}
          onConfirmCorrect={confirmCorrection}
          onCancelCorrect={() => setPendingCorrection(null)}
          onClose={closePanel}
        />
      )}
      {panel?.kind === "subs" && (
        <SubstitutionPanel
          state={state}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          playerNames={playerNames}
          error={panelError}
          onSubstitute={handleSubstitute}
          onDefensiveChange={handleDefensiveChange}
          onClose={closePanel}
        />
      )}
      {panel?.kind === "report" && (
        <ReportPanel
          state={state}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          game={game}
          playerNames={playerNames}
          jerseyOf={jerseyOf}
          phase={phase}
          canFinalize={phase === "scoring"}
          busy={busy}
          error={panelError}
          mode={mode}
          onFinalize={() => void handleFinalize()}
          onEndHalfInning={handleEndHalfInning}
          onClose={closePanel}
        />
      )}
      {panel?.kind === "help" && <HowToPanel onClose={closePanel} />}
      {panel?.kind === "context" && (
        <SidePanel title="Contexto" subtitle={`${viewTeam.name}`} onClose={closePanel} width="md">
          {contextPanel("border-l-0 px-0 py-0")}
        </SidePanel>
      )}
      {panel?.kind === "issues" && (
        <SidePanel title="Avisos por revisar" subtitle={`${state.issues.length} en esta libreta`} onClose={closePanel} width="md">
          {state.issues.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--sheet-muted)" }}>Sin avisos.</p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {state.issues.map((item, index) => (
                <li key={`${item.eventId ?? "x"}-${index}`} className="rounded-md border px-2.5 py-2" style={{ borderColor: item.severity === "error" ? "var(--sheet-out)" : "var(--sheet-error)" }}>
                  <span className="mr-1.5 text-[10px] font-bold uppercase" style={{ color: item.severity === "error" ? "var(--sheet-out)" : "var(--sheet-error)" }}>
                    {item.severity === "error" ? "Error" : "Aviso"}
                  </span>
                  {item.message}
                </li>
              ))}
            </ol>
          )}
        </SidePanel>
      )}
    </div>
  );
}
