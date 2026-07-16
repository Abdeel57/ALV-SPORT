"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConsoleTeam } from "./types";

interface LineupPanelProps {
  homeTeam: ConsoleTeam;
  awayTeam: ConsoleTeam;
  /** En innings el orden de selección ES el orden al bat. */
  isInnings: boolean;
  initialLineups: Record<string, string[]>;
  busy: boolean;
  error: string | null;
  demoMode: boolean;
  onConfirm: (lineups: Record<string, string[]>) => void;
}

function TeamLineup({
  team,
  selected,
  isInnings,
  onToggle,
}: {
  team: ConsoleTeam;
  selected: string[];
  isInnings: boolean;
  onToggle: (playerId: string) => void;
}) {
  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span
            className="size-3 rounded-full"
            style={{ backgroundColor: team.color ?? "#666" }}
            aria-hidden
          />
          <span className="font-display text-xl">{team.name}</span>
          <Badge variant="secondary" className="ml-auto tabular-nums">
            {selected.length} titulares
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {team.roster.map((player) => {
          const order = selected.indexOf(player.playerId);
          const isSelected = order >= 0;
          return (
            <button
              key={player.playerId}
              type="button"
              onClick={() => onToggle(player.playerId)}
              aria-pressed={isSelected}
              className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 text-left transition-colors ${
                isSelected
                  ? "border-brand-amber/60 bg-secondary"
                  : "border-border hover:bg-muted"
              }`}
            >
              <span className="w-8 text-center font-display text-lg tabular-nums text-muted-foreground">
                {player.jerseyNumber ?? "—"}
              </span>
              <span className="flex-1 truncate">
                {player.firstName} {player.lastName}
              </span>
              {isSelected && (
                <Badge className="tabular-nums">
                  {isInnings ? `Bat ${order + 1}` : "Titular"}
                </Badge>
              )}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function LineupPanel({
  homeTeam,
  awayTeam,
  isInnings,
  initialLineups,
  busy,
  error,
  demoMode,
  onConfirm,
}: LineupPanelProps) {
  const [selections, setSelections] = useState<Record<string, string[]>>(() => ({
    [awayTeam.id]: initialLineups[awayTeam.id] ?? [],
    [homeTeam.id]: initialLineups[homeTeam.id] ?? [],
  }));

  const toggle = (teamId: string) => (playerId: string) => {
    setSelections((current) => {
      const list = current[teamId] ?? [];
      return {
        ...current,
        [teamId]: list.includes(playerId)
          ? list.filter((id) => id !== playerId)
          : [...list, playerId],
      };
    });
  };

  const awaySelected = selections[awayTeam.id] ?? [];
  const homeSelected = selections[homeTeam.id] ?? [];
  const ready = awaySelected.length >= 1 && homeSelected.length >= 1;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-3xl">Alineaciones</h1>
        {demoMode && (
          <Badge variant="outline" className="border-brand-amber/50 text-brand-amber">
            Modo demo · sin conexión a Supabase
          </Badge>
        )}
      </header>
      <p className="text-sm text-muted-foreground">
        Marca a los titulares de cada equipo
        {isInnings ? " en su orden al bat (el orden en que los toques)" : ""}.
      </p>
      <div className="flex flex-col gap-4 lg:flex-row">
        <TeamLineup
          team={awayTeam}
          selected={awaySelected}
          isInnings={isInnings}
          onToggle={toggle(awayTeam.id)}
        />
        <TeamLineup
          team={homeTeam}
          selected={homeSelected}
          isInnings={isInnings}
          onToggle={toggle(homeTeam.id)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        size="lg"
        className="min-h-14 text-base"
        disabled={!ready || busy}
        onClick={() => onConfirm(selections)}
      >
        {busy ? "Iniciando…" : "Confirmar alineaciones e iniciar partido"}
      </Button>
    </main>
  );
}
