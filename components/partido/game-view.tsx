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
  const tint = color ?? "#666";
  return (
    <Link
      href={`/equipo/${slug}`}
      className={`group flex min-w-0 flex-1 items-center gap-3 ${
        align === "right" ? "flex-row-reverse text-right" : ""
      }`}
    >
      <span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-full border font-display text-xl transition-transform duration-200 motion-safe:group-hover:scale-105 sm:size-14 sm:text-2xl"
        style={{
          backgroundColor: `${tint}26`,
          borderColor: `${tint}66`,
          boxShadow: `0 0 26px ${tint}33`,
        }}
      >
        {name.slice(0, 1)}
      </span>
      <span className="truncate font-display text-lg leading-tight sm:text-2xl">
        {name}
      </span>
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
    type BrowserClient = ReturnType<
      typeof import("@/lib/supabase/client").getSupabaseBrowserClient
    >;
    let client: BrowserClient | undefined;
    let channel: ReturnType<BrowserClient["channel"]> | undefined;
    let cancelled = false;

    void (async () => {
      // El cliente de Supabase (~40 KiB) se importa bajo demanda: solo cuando
      // hay un partido EN VIVO. Así no pesa en el bundle inicial del partido
      // (los finalizados —la mayoría— nunca lo descargan).
      try {
        const mod = await import("@/lib/supabase/client");
        client = mod.getSupabaseBrowserClient();
      } catch {
        return;
      }
      if (cancelled || !client) return;
      const activeClient = client;
      const columns =
        "id, seq, game_id, team_id, player_id, event_type, payload, period, clock_seconds, corrects_event_id";
      channel = activeClient
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
          void activeClient
            .from("game_events")
            .select(columns)
            .eq("game_id", game.id)
            .order("seq")
            .then(({ data }) => {
              if (data) setEvents((data as ServerEventRow[]).map(mapRow));
            });
        });
    })();

    return () => {
      cancelled = true;
      if (client && channel) void client.removeChannel(channel);
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

  function shareText(): string {
    const away = `${game.away.name} ${awayScore ?? ""}`.trim();
    const home = `${homeScore ?? ""} ${game.home.name}`.trim();
    const state = isLive ? "🔴 EN VIVO" : isFinal ? "🏆 Final" : "📅 Próximo";
    return `${state}  ${away} – ${home}  ·  ${league.name}`;
  }

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = shareText();
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "ALV SPORT", text, url });
        return;
      } catch {
        // Cancelado o no disponible: cae al link de WhatsApp.
      }
    }
    if (typeof window !== "undefined") {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
        "_blank",
        "noopener,noreferrer",
      );
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6">
      {/* Header del partido: marcador broadcast teñido por los colores oficiales */}
      <section
        aria-label="Marcador"
        className={`card-elevated relative overflow-hidden rounded-2xl ${
          isLive ? "border-brand-red/35" : ""
        }`}
      >
        {isLive ? (
          <div className="live-bar h-1 w-full" aria-hidden />
        ) : (
          <div className="bg-brand-gradient h-1 w-full opacity-35" aria-hidden />
        )}
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(105deg, ${game.away.color ?? "#666"}2e 0%, transparent 42%, transparent 58%, ${game.home.color ?? "#666"}2e 100%)`,
          }}
        />
        <span
          aria-hidden
          className="absolute -top-20 -left-20 size-60 rounded-full blur-3xl"
          style={{ backgroundColor: `${game.away.color ?? "#666"}1f` }}
        />
        <span
          aria-hidden
          className="absolute -right-20 -bottom-20 size-60 rounded-full blur-3xl"
          style={{ backgroundColor: `${game.home.color ?? "#666"}1f` }}
        />
        <div className="relative flex flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">{league.name}</span>
            <div className="flex items-center gap-2">
              {isLive ? (
                <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.18em] text-primary uppercase">
                  <span className="live-dot size-2" aria-hidden />
                  En vivo
                </span>
              ) : (
                <Badge variant="outline">{isFinal ? "Final" : "Programado"}</Badge>
              )}
              <button
                type="button"
                onClick={share}
                aria-label="Compartir el partido"
                className="flex min-h-8 items-center gap-1.5 rounded-lg border border-brand-silver/25 px-2.5 text-xs font-medium transition-colors hover:bg-muted"
              >
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
                </svg>
                Compartir
              </button>
            </div>
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
              className="flex items-baseline gap-3 font-display text-5xl tabular-nums sm:text-7xl"
            >
              <span key={`a-${awayScore}`} className="score-pop inline-block">
                {awayScore ?? "—"}
              </span>
              <span className="text-2xl text-muted-foreground sm:text-3xl">–</span>
              <span key={`h-${homeScore}`} className="score-pop inline-block">
                {homeScore ?? "—"}
              </span>
            </div>
            <TeamBlock
              name={game.home.name}
              slug={game.home.slug}
              color={game.home.color}
              align="right"
            />
          </div>
          <p className="text-center text-xs text-muted-foreground tabular-nums">
            {dateFormat.format(new Date(game.scheduledAt))}
          </p>
        </div>
      </section>

      <Tabs defaultValue="resumen">
        <TabsList
          variant="line"
          className="h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b border-white/5 p-0"
        >
          {[
            ["resumen", "Resumen"],
            ["timeline", "Timeline"],
            ["estadisticas", "Estadísticas"],
            ["alineaciones", "Alineaciones"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-auto flex-none px-4 py-2.5 text-[13px] font-semibold tracking-[0.08em] uppercase after:bottom-[-1px] after:h-0.5 after:bg-brand-gradient data-active:text-foreground"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="flex flex-col gap-4 pt-4">
          {effective.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              El partido aún no comienza: la línea por{" "}
              {sportConfig.periodStructure.label.toLowerCase()} aparecerá aquí.
            </p>
          ) : (
            <div className="card-elevated overflow-x-auto rounded-xl">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
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
                      className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                        scoring ? "bg-brand-amber/10" : ""
                      }`}
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
            <div className="card-elevated flex flex-col gap-3 rounded-xl p-4">
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
