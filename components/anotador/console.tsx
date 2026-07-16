"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { LineupPanel } from "./lineup-panel";
import { ScoringScreen } from "./scoring-screen";
import type { ConsoleProps, ServerEventRow } from "./types";
import type { EngineGameEvent } from "@/lib/engine";
import { computeScore, effectiveEvents } from "@/lib/engine";
import {
  connectionStatus,
  createSyncEngine,
  initialQueueState,
  loadGameMeta,
  loadQueuedEvents,
  pendingCount as countPending,
  persistGameMeta,
  persistQueuedEvents,
  queueReducer,
  type GameMeta,
  type QueuedEventInput,
  type SyncEngine,
} from "@/lib/offline";
import { createSupabaseUploader } from "@/lib/offline/supabase-uploader";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Phase = "lineups" | "scoring" | "finished";
type Half = "top" | "bottom" | null;

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

export function AnotadorConsole(props: ConsoleProps) {
  const { mode, userId, game, homeTeam, awayTeam, sportConfig } = props;
  const isInnings = sportConfig.periodStructure.type === "innings";

  const [phase, setPhase] = useState<Phase>(() =>
    game.status === "finalized"
      ? "finished"
      : game.status === "in_progress"
        ? "scoring"
        : "lineups",
  );
  const [queue, dispatch] = useReducer(queueReducer, initialQueueState);
  const [serverEvents, setServerEvents] = useState<ServerEventRow[]>(
    props.initialEvents,
  );
  const [period, setPeriod] = useState(1);
  const [half, setHalf] = useState<Half>(isInnings ? "top" : null);
  const [lineups, setLineups] = useState<Record<string, string[]>>({});
  const [hydrated, setHydrated] = useState(false);
  const [online, setOnline] = useState(true);
  const [activeTeamId, setActiveTeamId] = useState(awayTeam.id);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // El sync engine lee el estado vía ref para no capturar closures viejos.
  const queueRef = useRef(queue);
  queueRef.current = queue;

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
    return createSyncEngine({
      store: { getState: () => queueRef.current, dispatch },
      upload: createSupabaseUploader(supabase),
    });
  }, [supabase]);

  // --- Recuperación: hidratar cola y punto del partido desde IndexedDB ---
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [events, meta] = await Promise.all([
          loadQueuedEvents(game.id),
          loadGameMeta(game.id),
        ]);
        if (cancelled) return;
        if (events.length > 0) dispatch({ type: "hydrate", events });
        if (meta) {
          setPeriod(meta.period);
          setHalf(meta.half);
          setLineups(meta.lineups);
          setActiveTeamId(meta.half === "bottom" ? homeTeam.id : awayTeam.id);
          if (meta.phase === "scoring" && game.status !== "finalized") {
            setPhase("scoring");
          }
          if (meta.phase === "finished" || game.status === "finalized") {
            setPhase("finished");
          }
        }
      } catch {
        // IndexedDB no disponible: la mesa sigue funcionando en memoria.
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  // --- Persistencia continua (cola + punto del partido) ---
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
      updatedAt: new Date().toISOString(),
    };
    void persistGameMeta(meta).catch(() => undefined);
  }, [hydrated, game.id, phase, period, half, lineups]);

  // --- Conectividad y sincronización ---
  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (!syncEngine || !online || countPending(queue) === 0) return;
    void syncEngine.flush();
    const interval = setInterval(() => {
      void syncEngine.flush();
    }, 8000);
    return () => clearInterval(interval);
  }, [syncEngine, online, queue]);

  // --- Realtime: eventos insertados desde este u otros dispositivos ---
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
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, game.id]);

  // --- Línea de tiempo unificada: servidor + cola local (dedupe por UUID) ---
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
      dispatch({ type: "enqueue", event: input });
    },
    [game.id, period, userId],
  );

  const handleAction = useCallback(
    (eventTypeKey: string) => {
      const def = sportConfig.eventTypes.find((et) => et.key === eventTypeKey);
      if (!def) return;
      if (def.requiresPlayer && !selectedPlayerId) return;
      registerEvent(eventTypeKey, {
        teamId: activeTeamId,
        playerId: def.requiresPlayer ? selectedPlayerId : null,
      });
    },
    [sportConfig, selectedPlayerId, activeTeamId, registerEvent],
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
      setBusy(true);
      try {
        setLineups(confirmed);
        if (supabase) {
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
            .upsert(rows, { onConflict: "game_id,player_id" });
          if (lineupError) throw new Error(lineupError.message);
          if (game.status === "scheduled") {
            const { error: startError } = await supabase.rpc("start_game", {
              p_game: game.id,
            });
            if (startError) throw new Error(startError.message);
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
    [supabase, game.id, game.status, isInnings, awayTeam.id, homeTeam.id],
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
        const result = await syncEngine.flush();
        if (result.error || countPending(queueRef.current) > 0) {
          throw new Error(
            result.error ?? "Aún hay eventos pendientes de sincronizar",
          );
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
  }, [mode, supabase, syncEngine, game.id]);

  // --- Render por fase ---
  const status = connectionStatus(queue, mode === "demo" ? false : online);
  const pending = countPending(queue);

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
      busy={busy}
      error={actionError}
    />
  );
}
