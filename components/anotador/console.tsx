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
import { createSupabaseUploader } from "@/lib/offline/supabase-uploader";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Phase = "lineups" | "scoring" | "finished";
type Half = "top" | "bottom" | null;

const RETRY_COOLDOWN_MS = 8000;
const EVENT_COLUMNS =
  "id, seq, game_id, team_id, player_id, event_type, payload, period, clock_seconds, corrects_event_id, created_by, created_at";

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

  const supabase = useMemo(() => {
    if (mode !== "live") return null;
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, [mode]);

  const syncEngine: SyncEngine | null = useMemo(() => {
    if (!supabase) return null;
    return createSyncEngine({ store, upload: createSupabaseUploader(supabase) });
  }, [supabase, store]);

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

  // --- Realtime + catch-up ---
  const refetchServerEvents = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("game_events")
      .select(EVENT_COLUMNS)
      .eq("game_id", game.id)
      .order("seq");
    if (data) setServerEvents(data as ServerEventRow[]);
  }, [supabase, game.id]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`game-events-${game.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_events",
          filter: `game_id=eq.${game.id}`,
        },
        (payload) => {
          const row = payload.new as ServerEventRow;
          setServerEvents((prev) =>
            prev.some((event) => event.id === row.id)
              ? prev
              : [...prev, row].sort((a, b) => a.seq - b.seq),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${game.id}`,
        },
        (payload) => {
          const next = (payload.new as { status?: string }).status;
          if (next === "finalized" || next === "canceled") {
            setFinalizedElsewhere(true);
          }
        },
      )
      .subscribe((status) => {
        // Catch-up: postgres_changes no repite lo insertado entre el fetch
        // SSR y la suscripción (ni durante reconexiones del canal).
        if (status === "SUBSCRIBED") void refetchServerEvents();
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, game.id, refetchServerEvents]);

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
        if (supabase) {
          // Reemplazo completo: un reintento con selección distinta no debe
          // dejar titulares fantasma de la confirmación anterior.
          const { error: deleteError } = await supabase
            .from("game_lineups")
            .delete()
            .eq("game_id", game.id);
          if (deleteError) throw new Error(deleteError.message);
          const rows = Object.entries(confirmed).flatMap(([teamId, playerIds]) =>
            playerIds.map((playerId, index) => ({
              game_id: game.id,
              team_id: teamId,
              player_id: playerId,
              is_starter: true,
              batting_order: isInnings ? index + 1 : null,
            })),
          );
          const { error: lineupError } = await supabase
            .from("game_lineups")
            .insert(rows);
          if (lineupError) throw new Error(lineupError.message);
          // start_game es idempotente en el servidor: si un intento previo
          // ya inició el juego, reintentar no truena.
          const { error: startError } = await supabase.rpc("start_game", {
            p_game: game.id,
          });
          if (startError) throw new Error(startError.message);
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
    [mode, supabase, game.id, isInnings, awayTeam.id, homeTeam.id],
  );

  const handleFinalize = useCallback(async () => {
    setActionError(null);
    setBusy(true);
    try {
      if (mode === "live") {
        if (!supabase || !syncEngine) {
          throw new Error("Supabase no está configurado");
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
        const { error } = await supabase.rpc("finalize_game", { p_game: game.id });
        if (error) throw new Error(error.message);
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
  }, [mode, supabase, syncEngine, game.id, store]);

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
            a Supabase y los standings ya estarían refrescados.
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
