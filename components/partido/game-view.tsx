"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GameDetail, LineupEntry } from "@/lib/data/types";
import type { EngineGameEvent } from "@/lib/engine";
import { computeScore, effectiveEvents } from "@/lib/engine";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Vista completa del partido. Se renderiza en el servidor (SEO) y, si el
 * partido está EN VIVO con Supabase configurado, se actualiza por Realtime
 * sin recargar: cada INSERT en game_events recalcula marcador, línea por
 * periodo, timeline y estadísticas con el motor.
 */

interface ServerEventRow {
  id: string;
  seq: number;
  game_id: string;
  team_id: string | null;
  player_id: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  period: number | null;
  clock_seconds: number | null;
  corrects_event_id: string | null;
}

function mapRow(row: ServerEventRow): EngineGameEvent {
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

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

function TeamBlock({
  name,
  slug,
  color,
  align,
}: {
  name: string;
  slug: string;
  color: string | null;
  align: "left" | "right";
}) {
  return (
    <Link
      href={`/equipo/${slug}`}
      className={`flex min-w-0 flex-1 items-center gap-3 ${
        align === "right" ? "flex-row-reverse text-right" : ""
      }`}
    >
      <span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-full border font-display text-xl"
        style={{
          backgroundColor: `${color ?? "#666"}26`,
          borderColor: `${color ?? "#666"}66`,
        }}
      >
        {name.slice(0, 1)}
      </span>
      <span className="truncate font-display text-lg sm:text-2xl">{name}</span>
    </Link>
  );
}

export function GameView({
  detail,
  realtime,
}: {
  detail: GameDetail;
  realtime: boolean;
}) {
  const { game, sportConfig, lineups, playerNames, league } = detail;
  const [events, setEvents] = useState<EngineGameEvent[]>(detail.events);
  const [status, setStatus] = useState(game.status);

  useEffect(() => {
    if (!realtime || status !== "in_progress") return;
    let supabase;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      return;
    }
    const columns =
      "id, seq, game_id, team_id, player_id, event_type, payload, period, clock_seconds, corrects_event_id";
    const channel = supabase
      .channel(`public-game-${game.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_events",
          filter: `game_id=eq.${game.id}`,
        },
        (payload) => {
          const row = mapRow(payload.new as ServerEventRow);
          setEvents((prev) =>
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
          if (next) setStatus(next as typeof status);
        },
      )
      .subscribe((subscriptionStatus) => {
        // Catch-up: postgres_changes no re-emite lo perdido entre el fetch
        // SSR y la suscripción, ni durante reconexiones del canal.
        if (subscriptionStatus !== "SUBSCRIBED") return;
        void supabase
          .from("game_events")
          .select(columns)
          .eq("game_id", game.id)
          .order("seq")
          .then(({ data }) => {
            if (data) setEvents((data as ServerEventRow[]).map(mapRow));
          });
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [realtime, status, game.id]);

  const score = useMemo(
    () => computeScore(events, sportConfig, { onUnknownEventType: "ignore" }),
    [events, sportConfig],
  );
  const effective = useMemo(() => effectiveEvents(events), [events]);

  const isLive = status === "in_progress";
  const isFinal = status === "finalized";
  const awayScore = score.byTeam[game.away.id]?.total ?? (isFinal || isLive ? 0 : null);
  const homeScore = score.byTeam[game.home.id]?.total ?? (isFinal || isLive ? 0 : null);
  const periodCount = Math.max(
    sportConfig.periodStructure.count,
    ...effective.map((event) => event.period ?? 0),
  );

  const eventLabel = useMemo(() => {
    const index = new Map(sportConfig.eventTypes.map((et) => [et.key, et]));
    return (key: string) => index.get(key);
  }, [sportConfig]);

  const teamOf = (teamId: string | null) =>
    teamId === game.home.id ? game.home : teamId === game.away.id ? game.away : null;

  // Estadísticas comparativas: conteo de eventos efectivos por tipo y equipo.
  const comparison = useMemo(() => {
    const counts = new Map<string, { away: number; home: number }>();
    for (const event of effective) {
      if (!event.teamId) continue;
      const entry = counts.get(event.eventType) ?? { away: 0, home: 0 };
      if (event.teamId === game.away.id) entry.away += 1;
      else if (event.teamId === game.home.id) entry.home += 1;
      counts.set(event.eventType, entry);
    }
    return sportConfig.eventTypes
      .map((et) => ({ label: et.label, ...(counts.get(et.key) ?? { away: 0, home: 0 }) }))
      .filter((row) => row.away + row.home > 0);
  }, [effective, sportConfig, game.away.id, game.home.id]);

  const timeline = [...effective].reverse();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6">
      {/* Header del partido: colores oficiales tiñendo cada lado */}
      <section
        aria-label="Marcador"
        className="relative overflow-hidden rounded-2xl border"
        style={{
          backgroundImage: `linear-gradient(105deg, ${game.away.color ?? "#666"}22 0%, transparent 38%, transparent 62%, ${game.home.color ?? "#666"}22 100%)`,
        }}
      >
        {isLive && <div className="bg-brand-gradient h-1 w-full" aria-hidden />}
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{league.name}</span>
            {isLive ? (
              <span className="flex items-center gap-1.5 font-semibold text-primary">
                <span
                  className="size-2 rounded-full bg-primary motion-safe:animate-pulse"
                  aria-hidden
                />
                EN VIVO
              </span>
            ) : (
              <Badge variant="outline">{isFinal ? "Final" : "Programado"}</Badge>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <TeamBlock
              name={game.away.name}
              slug={game.away.slug}
              color={game.away.color}
              align="left"
            />
            <div
              aria-label={`Marcador: ${game.away.name} ${awayScore ?? "—"}, ${game.home.name} ${homeScore ?? "—"}`}
              className="flex items-baseline gap-3 font-display text-5xl tabular-nums sm:text-6xl"
            >
              <span>{awayScore ?? "—"}</span>
              <span className="text-2xl text-muted-foreground">–</span>
              <span>{homeScore ?? "—"}</span>
            </div>
            <TeamBlock
              name={game.home.name}
              slug={game.home.slug}
              color={game.home.color}
              align="right"
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {dateFormat.format(new Date(game.scheduledAt))}
          </p>
        </div>
      </section>

      <Tabs defaultValue="resumen">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="estadisticas">Estadísticas</TabsTrigger>
          <TabsTrigger value="alineaciones">Alineaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="flex flex-col gap-4 pt-4">
          {effective.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              El partido aún no comienza: la línea por{" "}
              {sportConfig.periodStructure.label.toLowerCase()} aparecerá aquí.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipo</TableHead>
                    {Array.from({ length: periodCount }, (_, i) => (
                      <TableHead key={i} className="text-center">
                        {i + 1}
                      </TableHead>
                    ))}
                    <TableHead className="text-right font-bold">T</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {[game.away, game.home].map((team) => (
                    <TableRow key={team.id}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: team.color ?? "#666" }}
                            aria-hidden
                          />
                          {team.name}
                        </span>
                      </TableCell>
                      {Array.from({ length: periodCount }, (_, i) => (
                        <TableCell key={i} className="text-center text-muted-foreground">
                          {score.byTeam[team.id]?.byPeriod[i + 1] ?? 0}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-bold">
                        {score.byTeam[team.id]?.total ?? 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="pt-4">
          {timeline.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Aún no hay jugadas registradas.
            </p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {timeline.map((event) => {
                const def = eventLabel(event.eventType);
                const team = teamOf(event.teamId);
                const scoring = (def?.scoreDelta ?? 0) > 0;
                return (
                  <li
                    key={event.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                      scoring ? "border-brand-amber/40 bg-brand-amber/5" : ""
                    }`}
                  >
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
                      style={{
                        borderColor: `${team?.color ?? "#666"}88`,
                        color: team?.color ?? undefined,
                      }}
                    >
                      {scoring ? "+" + (def?.scoreDelta ?? 0) : (def?.label ?? event.eventType).slice(0, 2)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{def?.label ?? event.eventType}</span>
                      {event.playerId && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {playerNames[event.playerId] ?? "—"}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {sportConfig.periodStructure.label.slice(0, 1)}
                      {event.period ?? "—"}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="estadisticas" className="pt-4">
          {comparison.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Las estadísticas comparativas aparecerán con las primeras jugadas.
            </p>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{game.away.name}</span>
                <span>{game.home.name}</span>
              </div>
              {comparison.map((row) => {
                const total = row.away + row.home;
                const awayPct = total === 0 ? 50 : (row.away / total) * 100;
                return (
                  <div key={row.label} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-sm tabular-nums">
                      <span className="w-8 font-semibold">{row.away}</span>
                      <span className="text-xs text-muted-foreground">{row.label}</span>
                      <span className="w-8 text-right font-semibold">{row.home}</span>
                    </div>
                    <div
                      className="flex h-2 overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={`${row.label}: ${row.away} contra ${row.home}`}
                    >
                      <div
                        className="h-full"
                        style={{
                          width: `${awayPct}%`,
                          backgroundColor: game.away.color ?? "#888",
                        }}
                      />
                      <div
                        className="h-full flex-1"
                        style={{ backgroundColor: game.home.color ?? "#444" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="alineaciones" className="pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {[game.away, game.home].map((team) => {
              const entries: LineupEntry[] = lineups[team.id] ?? [];
              return (
                <section key={team.id} aria-label={`Alineación de ${team.name}`}>
                  <h3 className="mb-2 flex items-center gap-2 font-display text-lg">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: team.color ?? "#666" }}
                      aria-hidden
                    />
                    {team.name}
                  </h3>
                  {entries.length === 0 ? (
                    <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                      Alineación no confirmada.
                    </p>
                  ) : (
                    <ol className="flex flex-col gap-1">
                      {entries.map((entry) => (
                        <li key={entry.playerId}>
                          <Link
                            href={`/jugador/${entry.playerId}`}
                            className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted"
                          >
                            <span className="w-7 text-center font-display text-muted-foreground tabular-nums">
                              {entry.battingOrder ?? entry.jerseyNumber ?? "—"}
                            </span>
                            <span className="truncate">{entry.name}</span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
