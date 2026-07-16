"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { ServerEventRow } from "@/components/anotador/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EngineGameEvent, SportConfig } from "@/lib/engine";
import { computeScore, effectiveEvents } from "@/lib/engine";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface LiveTeam {
  id: string;
  name: string;
  color: string | null;
}

interface LiveGameProps {
  gameId: string;
  status: string;
  homeTeam: LiveTeam;
  awayTeam: LiveTeam;
  sportConfig: SportConfig;
  initialEvents: ServerEventRow[];
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

export function LiveGame(props: LiveGameProps) {
  const { gameId, homeTeam, awayTeam, sportConfig } = props;
  const [rows, setRows] = useState<ServerEventRow[]>(props.initialEvents);
  const [status, setStatus] = useState(props.status);

  // Marcador en vivo: cada INSERT en game_events llega por Realtime.
  useEffect(() => {
    let supabase;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      return;
    }
    const channel = supabase
      .channel(`public-game-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_events",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const row = payload.new as ServerEventRow;
          setRows((prev) =>
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
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const next = (payload.new as { status?: string }).status;
          if (next) setStatus(next);
        },
      )
      .subscribe((subscriptionStatus) => {
        // Catch-up: lo insertado entre el fetch SSR y la suscripción (o
        // durante una reconexión del canal) no se re-emite — refetch.
        if (subscriptionStatus !== "SUBSCRIBED") return;
        void supabase
          .from("game_events")
          .select(
            "id, seq, game_id, team_id, player_id, event_type, payload, period, clock_seconds, corrects_event_id, created_by, created_at",
          )
          .eq("game_id", gameId)
          .order("seq")
          .then(({ data }) => {
            if (data) setRows(data as ServerEventRow[]);
          });
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId]);

  const engineEvents = useMemo(() => rows.map(mapRow), [rows]);
  const score = useMemo(
    () => computeScore(engineEvents, sportConfig, { onUnknownEventType: "ignore" }),
    [engineEvents, sportConfig],
  );
  const effective = useMemo(() => effectiveEvents(engineEvents), [engineEvents]);

  const periodCount = Math.max(
    sportConfig.periodStructure.count,
    ...effective.map((event) => event.period ?? 0),
  );
  const eventLabel = useMemo(() => {
    const index = new Map(sportConfig.eventTypes.map((et) => [et.key, et.label]));
    return (key: string) => index.get(key) ?? key;
  }, [sportConfig]);

  const teamName = (id: string | null) =>
    id === homeTeam.id ? homeTeam.name : id === awayTeam.id ? awayTeam.name : "";

  const lastPlays = [...effective].slice(-10).reverse();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-center gap-6 font-display text-5xl tabular-nums sm:text-6xl">
        <span className="flex flex-col items-center gap-1">
          <span className="text-base" style={{ color: awayTeam.color ?? undefined }}>
            {awayTeam.name}
          </span>
          <span>{score.byTeam[awayTeam.id]?.total ?? 0}</span>
        </span>
        <span className="text-2xl text-muted-foreground">
          {status === "in_progress" ? (
            <Badge className="bg-primary text-primary-foreground">EN VIVO</Badge>
          ) : (
            "—"
          )}
        </span>
        <span className="flex flex-col items-center gap-1">
          <span className="text-base" style={{ color: homeTeam.color ?? undefined }}>
            {homeTeam.name}
          </span>
          <span>{score.byTeam[homeTeam.id]?.total ?? 0}</span>
        </span>
      </div>
      {status === "in_progress" && (
        <div className="bg-brand-gradient mx-auto h-0.5 w-48 rounded-full" aria-hidden />
      )}

      <div className="overflow-x-auto">
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
            {[awayTeam, homeTeam].map((team) => (
              <TableRow key={team.id}>
                <TableCell>{team.name}</TableCell>
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

      <section className="flex flex-col gap-2">
        <h2 className="text-xs tracking-widest text-muted-foreground uppercase">
          Jugadas recientes
        </h2>
        {lastPlays.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay jugadas.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {lastPlays.map((event) => (
              <li key={event.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <span className="text-muted-foreground tabular-nums">
                  {sportConfig.periodStructure.label.slice(0, 1)}
                  {event.period ?? "—"}
                </span>
                <span className="font-medium">{eventLabel(event.eventType)}</span>
                <span className="text-muted-foreground">{teamName(event.teamId)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
