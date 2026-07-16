"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EngineGameEvent, GameScore, SportConfig } from "@/lib/engine";
import type { ConnectionStatus } from "@/lib/offline";
import type { ConsoleTeam } from "./types";

interface ScoringScreenProps {
  config: SportConfig;
  homeTeam: ConsoleTeam;
  awayTeam: ConsoleTeam;
  lineups: Record<string, string[]>;
  activeTeamId: string;
  onSelectTeam: (teamId: string) => void;
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string | null) => void;
  onAction: (eventTypeKey: string) => void;
  onUndo: () => void;
  onCorrect: (eventId: string) => void;
  onClosePeriod: () => void;
  onFinalize: () => void;
  score: GameScore;
  effective: EngineGameEvent[];
  period: number;
  half: "top" | "bottom" | null;
  status: ConnectionStatus;
  pendingCount: number;
  /** Motivo del último fallo de sincronización, si lo hay. */
  syncError: string | null;
  busy: boolean;
  error: string | null;
}

function SyncIndicator({ status, pendingCount }: { status: ConnectionStatus; pendingCount: number }) {
  if (status === "offline") {
    return (
      <Badge variant="outline" className="border-destructive/60 text-destructive">
        Sin conexión{pendingCount > 0 ? ` · ${pendingCount} en cola` : ""}
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="outline" className="border-brand-amber/60 text-brand-amber">
        {pendingCount} {pendingCount === 1 ? "evento pendiente" : "eventos pendientes"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-brand-silver/40 text-brand-silver">
      Sincronizado
    </Badge>
  );
}

export function ScoringScreen(props: ScoringScreenProps) {
  const {
    config,
    homeTeam,
    awayTeam,
    lineups,
    activeTeamId,
    onSelectTeam,
    selectedPlayerId,
    onSelectPlayer,
    onAction,
    onUndo,
    onCorrect,
    onClosePeriod,
    onFinalize,
    score,
    effective,
    period,
    half,
    status,
    pendingCount,
    syncError,
    busy,
    error,
  } = props;

  const [finalizeArmed, setFinalizeArmed] = useState(false);

  const teams = useMemo(() => [awayTeam, homeTeam], [awayTeam, homeTeam]);
  const activeTeam = activeTeamId === homeTeam.id ? homeTeam : awayTeam;

  const playerName = useMemo(() => {
    const index = new Map<string, string>();
    for (const team of teams) {
      for (const player of team.roster) {
        index.set(player.playerId, `${player.firstName} ${player.lastName}`);
      }
    }
    return (id: string | null) => (id ? (index.get(id) ?? "—") : null);
  }, [teams]);

  const teamName = (id: string | null) =>
    id === homeTeam.id ? homeTeam.name : id === awayTeam.id ? awayTeam.name : null;

  const eventLabel = useMemo(() => {
    const index = new Map(config.eventTypes.map((et) => [et.key, et.label]));
    return (key: string) => index.get(key) ?? key;
  }, [config]);

  /** Jugadores visibles: alineación del equipo activo (o roster completo). */
  const railPlayers = useMemo(() => {
    const lineup = lineups[activeTeam.id];
    if (!lineup || lineup.length === 0) return activeTeam.roster;
    const byId = new Map(activeTeam.roster.map((p) => [p.playerId, p]));
    return lineup.flatMap((id) => {
      const player = byId.get(id);
      return player ? [player] : [];
    });
  }, [activeTeam, lineups]);

  const awayScore = score.byTeam[awayTeam.id]?.total ?? 0;
  const homeScore = score.byTeam[homeTeam.id]?.total ?? 0;
  const periodLabel = `${config.periodStructure.label} ${period}${
    period > config.periodStructure.count ? " (extra)" : ""
  }${half ? (half === "top" ? " · Alta" : " · Baja") : ""}`;

  const lastFive = effective.slice(-5).reverse();

  return (
    <main className="flex min-h-dvh flex-col">
      {/* Header fijo: marcador, periodo, EN VIVO, sincronización */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <Badge className="bg-primary text-primary-foreground">EN VIVO</Badge>
            <span className="text-sm text-muted-foreground">{periodLabel}</span>
          </div>
          <div className="flex items-center gap-4 font-display text-4xl tabular-nums sm:text-5xl">
            <span className="flex items-center gap-2">
              <span className="hidden text-lg sm:inline">{awayTeam.name}</span>
              <span>{awayScore}</span>
            </span>
            <span className="text-muted-foreground">—</span>
            <span className="flex items-center gap-2">
              <span>{homeScore}</span>
              <span className="hidden text-lg sm:inline">{homeTeam.name}</span>
            </span>
          </div>
          <SyncIndicator status={status} pendingCount={pendingCount} />
        </div>
        {syncError && pendingCount > 0 && (
          <p className="mx-auto w-full max-w-6xl px-4 pb-2 text-xs text-destructive">
            La sincronización está fallando: {syncError}. Se reintenta
            automáticamente; tus eventos siguen guardados en este dispositivo.
          </p>
        )}
        <div className="bg-brand-gradient h-0.5 w-full" aria-hidden />
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 lg:grid-cols-[280px_1fr]">
        {/* Riel de jugadores (tap 1) */}
        <section aria-label="Jugadores" className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => onSelectTeam(team.id)}
                aria-pressed={team.id === activeTeamId}
                className={`flex min-h-14 items-center justify-center gap-2 rounded-lg border px-2 text-sm transition-colors ${
                  team.id === activeTeamId
                    ? "border-brand-amber/60 bg-secondary font-semibold"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: team.color ?? "#666" }}
                  aria-hidden
                />
                <span className="truncate">{team.name}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5 overflow-y-auto">
            {railPlayers.map((player) => (
              <button
                key={player.playerId}
                type="button"
                onClick={() =>
                  onSelectPlayer(
                    selectedPlayerId === player.playerId ? null : player.playerId,
                  )
                }
                aria-pressed={selectedPlayerId === player.playerId}
                className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 text-left transition-colors ${
                  selectedPlayerId === player.playerId
                    ? "border-primary bg-primary/15"
                    : "border-border hover:bg-muted"
                }`}
              >
                <span className="w-8 text-center font-display text-lg tabular-nums text-muted-foreground">
                  {player.jerseyNumber ?? "—"}
                </span>
                <span className="flex-1 truncate">
                  {player.firstName} {player.lastName}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Acciones (tap 2) + historial */}
        <section className="flex flex-col gap-4">
          <div
            aria-label="Acciones"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4"
          >
            {/* Generados desde el config jsonb del deporte: cero hardcode. */}
            {config.eventTypes.map((eventType) => {
              const disabled = eventType.requiresPlayer && !selectedPlayerId;
              return (
                <Button
                  key={eventType.key}
                  variant={eventType.scoreDelta > 0 ? "default" : "secondary"}
                  className="min-h-14 text-base"
                  disabled={disabled || busy}
                  onClick={() => onAction(eventType.key)}
                >
                  {eventType.label}
                  {eventType.scoreDelta > 0 && (
                    <span className="ml-1 tabular-nums">+{eventType.scoreDelta}</span>
                  )}
                </Button>
              );
            })}
          </div>
          {selectedPlayerId === null && (
            <p className="text-sm text-muted-foreground">
              Toca un jugador y después la acción (máximo 2 taps).
            </p>
          )}

          <div className="mt-auto flex flex-col gap-3">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="min-h-14 flex-1 text-base"
                onClick={onUndo}
                disabled={effective.length === 0 || busy}
              >
                Deshacer último
              </Button>
              <Button
                variant="outline"
                className="min-h-14 flex-1 text-base"
                onClick={onClosePeriod}
                disabled={busy}
              >
                Cerrar {config.periodStructure.label.toLowerCase()}
                {half ? (half === "top" ? " (alta)" : " (baja)") : ""}
              </Button>
              {finalizeArmed ? (
                <div className="flex flex-1 gap-2">
                  <Button
                    variant="destructive"
                    className="min-h-14 flex-1 text-base"
                    disabled={busy}
                    onClick={() => {
                      setFinalizeArmed(false);
                      onFinalize();
                    }}
                  >
                    {busy ? "Finalizando…" : "Confirmar finalización"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-14 text-base"
                    onClick={() => setFinalizeArmed(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  className="min-h-14 flex-1 text-base"
                  disabled={busy}
                  onClick={() => setFinalizeArmed(true)}
                >
                  Finalizar partido…
                </Button>
              )}
            </div>

            <div aria-label="Últimos eventos" className="flex flex-col gap-1.5">
              <p className="text-xs tracking-widest text-muted-foreground uppercase">
                Últimos eventos
              </p>
              {lastFive.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin eventos todavía.</p>
              )}
              {lastFive.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground tabular-nums">
                    {config.periodStructure.label.slice(0, 1)}
                    {event.period ?? "—"}
                  </span>
                  <span className="flex-1 truncate">
                    <span className="font-medium">{eventLabel(event.eventType)}</span>
                    {event.playerId && ` · ${playerName(event.playerId)}`}
                    {event.teamId && (
                      <span className="text-muted-foreground"> · {teamName(event.teamId)}</span>
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => onCorrect(event.id)}
                  >
                    Corregir
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
