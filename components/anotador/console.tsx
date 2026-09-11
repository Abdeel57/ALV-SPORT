"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { LineupPanel } from "./lineup-panel";
import { ScoringScreen } from "./scoring-screen";
import type { ConsoleProps, ServerEventRow } from "./types";
import type { EngineGameEvent } from "@/lib/engine";
import { computeScore, effectiveEvents } from "@/lib/engine";
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

type Phase = "lineups" | "scoring" | "finished";
type Half = "top" | "bottom" | null;

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
 * Recuperación sin IndexedDB (cambio de dispositivo, storage purgado):
 * deriva el punto del partido desde los eventos del servidor. La media
 * entrada es una heurística (el último evento con equipo marca quién
 * batea) — mejor que reabrir en "Entrada 1 · Alta".
 */
function deriveProgress(
  events: readonly ServerEventRow[],
  isInnings: boolean,
  awayTeamId: string,
): { period: number; half: Half } {
  let period = 1;
  for (const event of events) {
    if (event.period !== null && event.period > period) period = event.period;
  }
  if (!isInnings) return { period, half: null };
  const lastWithTeam = [...events]
    .reverse()
    .find((event) => event.team_id !== null && event.period === period);
  return {
    period,
    half: !lastWithTeam || lastWithTeam.team_id === awayTeamId ? "top" : "bottom",
  };
}

export function AnotadorConsole(props: ConsoleProps) {
  const { mode, userId, game, homeTeam, awayTeam, sportConfig } = props;
  const isInnings = sportConfig.periodStructure.type === "innings";

  // Cola autoritativa FUERA de React: el sync engine necesita lecturas
  // síncronas tras cada dispatch (useReducer haría re-subir lotes).
  const store = useMemo(() => createQueueStore(), []);
  const queue = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  const [phase, setPhase] = useState<Phase>(() =>
    game.status === "finalized"
      ? "finished"
      : game.status === "in_progress"
        ? "scoring"
        : "lineups",
  );
  const [serverEvents, setServerEvents] = useState<ServerEventRow[]>(
    props.initialEvents,
  );
  const [period, setPeriod] = useState(1);
  const [half, setHalf] = useState<Half>(isInnings ? "top" : null);
  const [lineups, setLineups] = useState<Record<string, string[]>>(
    props.initialLineups ?? {},
  );
  const [hydrated, setHydrated] = useState(false);
  const [online, setOnline] = useState(true);
  const [activeTeamId, setActiveTeamId] = useState(
    isInnings ? awayTeam.id : homeTeam.id,
  );
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finalizedElsewhere, setFinalizedElsewhere] = useState(false);

  const isLive = mode === "live";

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
        const [events, storedMeta] = await Promise.all([
          loadQueuedEvents(game.id),
          loadGameMeta(game.id),
        ]);
        if (cancelled) return;
        if (events.length > 0) store.dispatch({ type: "hydrate", events });
        meta = storedMeta;
      } catch {
        // IndexedDB no disponible: la mesa sigue funcionando en memoria.
      }
      if (cancelled) return;
      if (meta) {
        setPeriod(meta.period);
        setHalf(isInnings ? meta.half : null);
        if (Object.keys(meta.lineups).length > 0) setLineups(meta.lineups);
        setActiveTeamId(
          meta.activeTeamId ??
            (isInnings && meta.half === "bottom" ? homeTeam.id : awayTeam.id),
        );
        if (meta.phase === "scoring" && game.status !== "finalized") {
          setPhase("scoring");
        }
        if (meta.phase === "finished" || game.status === "finalized") {
          setPhase("finished");
        }
      } else if (game.status === "in_progress" && props.initialEvents.length > 0) {
        const derived = deriveProgress(props.initialEvents, isInnings, awayTeam.id);
        setPeriod(derived.period);
        setHalf(derived.half);
        setActiveTeamId(derived.half === "bottom" ? homeTeam.id : awayTeam.id);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, store]);

  // --- Persistencia continua ---
  useEffect(() => {
    if (!hydrated) return;
    void persistQueuedEvents(queue.events).catch(() => undefined);
  }, [hydrated, queue.events]);

  useEffect(() => {
    if (!hydrated) return;
    const meta: GameMeta = {
      gameId: game.id,
      phase,
      period,
      half,
      lineups,
      activeTeamId,
      updatedAt: new Date().toISOString(),
    };
    void persistGameMeta(meta).catch(() => undefined);
  }, [hydrated, game.id, phase, period, half, lineups, activeTeamId]);

  // --- Conectividad ---
  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      requestFlush(true);
    };
    const goOffline = () => setOnline(false);
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
    if (pendingEvents(queue).some((event) => event.attempts === 0)) {
      requestFlush();
    }
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
      const response = await fetch(
        `/api/anotador/events?gameId=${encodeURIComponent(game.id)}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const body = (await response.json()) as { events?: ServerEventRow[] };
      if (body.events) setServerEvents(body.events);
    } catch {
      // Sin conexión: la cola local sigue siendo la fuente de la mesa.
    }
  }, [isLive, game.id]);

  useEffect(() => {
    if (!isLive) return;
    // Al (re)conectar se relee todo: el stream no repite lo insertado entre
    // el render del servidor y la suscripción.
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
        if (update.status === "finalized" || update.status === "canceled") {
          setFinalizedElsewhere(true);
        }
      } catch {
        // Mensaje ilegible: el siguiente trae el estado completo.
      }
    });
    // EventSource reintenta solo; al reconectar se vuelve a leer todo.
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

  const score = useMemo(
    () => computeScore(engineEvents, sportConfig, { onUnknownEventType: "ignore" }),
    [engineEvents, sportConfig],
  );
  const effective = useMemo(() => effectiveEvents(engineEvents), [engineEvents]);

  // --- Acciones ---
  const registerEvent = useCallback(
    (
      eventType: string,
      opts: {
        teamId?: string | null;
        playerId?: string | null;
        corrects?: string;
        period?: number | null;
      } = {},
    ) => {
      const input: QueuedEventInput = {
        id: crypto.randomUUID(),
        gameId: game.id,
        teamId: opts.teamId ?? null,
        playerId: opts.playerId ?? null,
        eventType,
        payload: {},
        period: opts.period !== undefined ? opts.period : period,
        clockSeconds: null,
        correctsEventId: opts.corrects ?? null,
        createdBy: userId,
        createdAt: new Date().toISOString(),
      };
      store.dispatch({ type: "enqueue", event: input });
      requestFlush();
    },
    [game.id, period, userId, store, requestFlush],
  );

  const battingTeamId = isInnings
    ? half === "bottom"
      ? homeTeam.id
      : awayTeam.id
    : null;

  const handleAction = useCallback(
    (eventTypeKey: string) => {
      const def = sportConfig.eventTypes.find((et) => et.key === eventTypeKey);
      if (!def) return;
      if (def.requiresPlayer && !selectedPlayerId) return;
      registerEvent(eventTypeKey, {
        teamId: activeTeamId,
        playerId: def.requiresPlayer ? selectedPlayerId : null,
      });
      // Tras anotar algo del equipo defensivo (p. ej. un error), regresar
      // automáticamente al equipo que batea evita acreditar la siguiente
      // carrera al equipo equivocado por olvido.
      if (battingTeamId && activeTeamId !== battingTeamId) {
        setActiveTeamId(battingTeamId);
        setSelectedPlayerId(null);
      }
    },
    [sportConfig, selectedPlayerId, activeTeamId, battingTeamId, registerEvent],
  );

  const handleQuickScore = useCallback(
    (teamId: string, targetScore: number) => {
      const pointEvent = sportConfig.eventTypes.find((eventType) => eventType.scoreDelta === 1);
      if (!pointEvent || sportConfig.standings.winnerBy === "periods_won") return;
      const currentScore = score.byTeam[teamId]?.total ?? 0;
      const pointsToAdd = targetScore - currentScore;
      if (!Number.isInteger(targetScore) || pointsToAdd < 0) return;
      for (let index = 0; index < pointsToAdd; index += 1) {
        registerEvent(pointEvent.key, { teamId, playerId: null });
      }
    },
    [registerEvent, score.byTeam, sportConfig],
  );

  const handleCorrect = useCallback(
    (eventId: string) => {
      const target = effective.find((event) => event.id === eventId);
      if (!target) return;
      registerEvent("correction", { corrects: target.id, period: target.period });
    },
    [effective, registerEvent],
  );

  const handleUndo = useCallback(() => {
    const last = effective[effective.length - 1];
    if (last) handleCorrect(last.id);
  }, [effective, handleCorrect]);

  const handleClosePeriod = useCallback(() => {
    setSelectedPlayerId(null);
    if (isInnings) {
      if (half === "top") {
        setHalf("bottom");
        setActiveTeamId(homeTeam.id);
      } else {
        setHalf("top");
        setPeriod((current) => current + 1);
        setActiveTeamId(awayTeam.id);
      }
    } else {
      setPeriod((current) => current + 1);
    }
  }, [isInnings, half, homeTeam.id, awayTeam.id]);

  const handleConfirmLineups = useCallback(
    async (confirmed: Record<string, string[]>) => {
      setActionError(null);
      if (mode === "live" && typeof navigator !== "undefined" && !navigator.onLine) {
        setActionError(
          "Necesitas conexión a internet para iniciar el partido. Una vez iniciado, la anotación funciona sin conexión.",
        );
        return;
      }
      setBusy(true);
      try {
        setLineups(confirmed);
        if (isLive) {
          // El servidor reemplaza las alineaciones e inicia el partido en una
          // sola transacción (start_game sigue siendo idempotente).
          const response = await fetch("/api/anotador/game", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "start",
              gameId: game.id,
              lineups: confirmed,
              battingOrder: isInnings,
            }),
          });
          if (!response.ok) {
            const detail = (await response.json().catch(() => null)) as
              | { error?: string }
              | null;
            throw new Error(detail?.error ?? `Error ${response.status}`);
          }
        }
        setPhase("scoring");
        setActiveTeamId(isInnings ? awayTeam.id : homeTeam.id);
      } catch (error) {
        setActionError(
          error instanceof Error
            ? `No se pudo iniciar el partido: ${error.message}`
            : "No se pudo iniciar el partido",
        );
      } finally {
        setBusy(false);
      }
    },
    [mode, isLive, game.id, isInnings, awayTeam.id, homeTeam.id],
  );

  const handleFinalize = useCallback(async () => {
    setActionError(null);
    setBusy(true);
    try {
      if (mode === "live") {
        if (!syncEngine) {
          throw new Error("La base de datos no está configurada");
        }
        // Antes de finalizar, TODOS los eventos deben estar en el servidor.
        // flush() encadenado: si hay uno en vuelo, espera su resultado real.
        for (let attempt = 0; attempt < 3; attempt += 1) {
          if (countPending(store.getState()) === 0) break;
          const result = await syncEngine.flush();
          if (result.error) {
            throw new Error(
              `No se pudieron sincronizar los eventos pendientes (${result.error})`,
            );
          }
        }
        if (countPending(store.getState()) > 0) {
          throw new Error("Aún hay eventos pendientes de sincronizar");
        }
        const response = await fetch("/api/anotador/game", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "finalize", gameId: game.id }),
        });
        if (!response.ok) {
          const detail = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(detail?.error ?? `Error ${response.status}`);
        }
      }
      setPhase("finished");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? `No se pudo finalizar: ${error.message}`
          : "No se pudo finalizar",
      );
    } finally {
      setBusy(false);
    }
  }, [mode, syncEngine, game.id, store]);

  // --- Render por fase ---
  const status = connectionStatus(queue, mode === "demo" ? false : online);
  const pending = countPending(queue);
  const syncError =
    pendingEvents(queue).find((event) => event.lastError)?.lastError ?? null;

  if (finalizedElsewhere && phase !== "finished") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-3xl">Partido finalizado desde otro lugar</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Un administrador finalizó o canceló este partido. La mesa quedó
          congelada para no registrar eventos que el servidor rechazaría.
        </p>
        {pending > 0 && (
          <p className="max-w-md text-sm text-destructive">
            Hay {pending} {pending === 1 ? "evento local" : "eventos locales"} sin
            sincronizar: contacta al administrador de la liga para conciliarlos.
          </p>
        )}
      </div>
    );
  }

  if (phase === "lineups") {
    return (
      <LineupPanel
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        isInnings={isInnings}
        initialLineups={lineups}
        sanctionedPlayerIds={props.sanctionedPlayerIds ?? []}
        busy={busy}
        error={actionError}
        demoMode={mode === "demo"}
        onConfirm={handleConfirmLineups}
      />
    );
  }

  if (phase === "finished") {
    const homeScore = score.byTeam[homeTeam.id]?.total ?? 0;
    const awayScore = score.byTeam[awayTeam.id]?.total ?? 0;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm tracking-widest text-muted-foreground uppercase">
          Partido finalizado
        </p>
        <p className="font-display text-5xl tabular-nums">
          {awayTeam.name} {awayScore} — {homeScore} {homeTeam.name}
        </p>
        {mode === "demo" ? (
          <p className="max-w-md text-sm text-muted-foreground">
            Modo demo: los {queue.events.length} eventos anotados viven en
            IndexedDB de este navegador. En modo real se habrían sincronizado
            al servidor y los standings ya estarían refrescados.
          </p>
        ) : (
          <p className="max-w-md text-sm text-muted-foreground">
            Marcador y estadísticas derivados de {effective.length} eventos.
            Los standings se refrescaron al finalizar.
          </p>
        )}
      </div>
    );
  }

  return (
    <ScoringScreen
      config={sportConfig}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      lineups={lineups}
      activeTeamId={activeTeamId}
      onSelectTeam={(teamId) => {
        setActiveTeamId(teamId);
        setSelectedPlayerId(null);
      }}
      selectedPlayerId={selectedPlayerId}
      onSelectPlayer={setSelectedPlayerId}
      onAction={handleAction}
      onQuickScore={handleQuickScore}
      onUndo={handleUndo}
      onCorrect={handleCorrect}
      onClosePeriod={handleClosePeriod}
      onFinalize={handleFinalize}
      score={score}
      effective={effective}
      period={period}
      half={half}
      status={status}
      pendingCount={pending}
      syncError={syncError}
      busy={busy}
      error={actionError}
    />
  );
}
