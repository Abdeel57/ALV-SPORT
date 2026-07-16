import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  computePlayerStats,
  computeScore,
  computeStandings,
} from "@/lib/engine";
import {
  basketballConfig,
  basketballGames,
  eventsByGameId,
  gameId,
  players,
  rosters,
  softballConfig,
  softballGames,
  teams,
} from "@/lib/seed-data";

export const metadata: Metadata = {
  title: "Demo con datos seed",
};

/*
 * Vista previa de desarrollo: TODO lo que ves aquí se calcula con el motor
 * (lib/engine) desde los datos seed (lib/seed-data) — la misma fuente que
 * genera supabase/seed.sql y alimenta las pruebas. Sin base de datos.
 * El sitio público real (Fase 2) leerá de Supabase con Realtime.
 */

const teamById = new Map(teams.map((team) => [team.id, team]));
const playerById = new Map(players.map((player) => [player.id, player]));
const teamOfPlayer = new Map(rosters.map((entry) => [entry.playerId, entry.teamId]));

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

function TeamLabel({ teamId: id }: { teamId: string }) {
  const team = teamById.get(id);
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: team?.color ?? "#666" }}
        aria-hidden
      />
      {team?.name ?? "—"}
    </span>
  );
}

function SoftballStandings() {
  const standings = computeStandings(softballGames, eventsByGameId, softballConfig);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl">
          Softbol · Tabla general
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Primera Fuerza — derivada de los eventos, con desempates
          head-to-head y diferencial de carreras aplicados por el motor.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Equipo</TableHead>
              <TableHead className="text-right">JJ</TableHead>
              <TableHead className="text-right">G</TableHead>
              <TableHead className="text-right">P</TableHead>
              <TableHead className="text-right">Pts</TableHead>
              <TableHead className="text-right">CF</TableHead>
              <TableHead className="text-right">CC</TableHead>
              <TableHead className="text-right">Dif</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {standings.map((row) => (
              <TableRow key={row.teamId}>
                <TableCell className="font-medium">{row.rank}</TableCell>
                <TableCell>
                  <TeamLabel teamId={row.teamId} />
                </TableCell>
                <TableCell className="text-right">{row.played}</TableCell>
                <TableCell className="text-right">{row.wins}</TableCell>
                <TableCell className="text-right">{row.losses}</TableCell>
                <TableCell className="text-right font-semibold">{row.points}</TableCell>
                <TableCell className="text-right">{row.scoreFor}</TableCell>
                <TableCell className="text-right">{row.scoreAgainst}</TableCell>
                <TableCell className="text-right">
                  {row.scoreDiff > 0 ? `+${row.scoreDiff}` : row.scoreDiff}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function LineScore({ gameUuid, periods, config }: {
  gameUuid: string;
  periods: number;
  config: typeof softballConfig;
}) {
  const events = eventsByGameId.get(gameUuid) ?? [];
  const game = [...softballGames, ...basketballGames].find((g) => g.id === gameUuid);
  if (!game) return null;
  const score = computeScore(events, config);
  const rows = [
    { id: game.awayTeamId, label: "Visita" },
    { id: game.homeTeamId, label: "Local" },
  ];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Equipo</TableHead>
          {Array.from({ length: periods }, (_, i) => (
            <TableHead key={i} className="text-center">{i + 1}</TableHead>
          ))}
          <TableHead className="text-right font-bold">T</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="tabular-nums">
        {rows.map(({ id }) => (
          <TableRow key={id}>
            <TableCell>
              <TeamLabel teamId={id} />
            </TableCell>
            {Array.from({ length: periods }, (_, i) => (
              <TableCell key={i} className="text-center text-muted-foreground">
                {score.byTeam[id]?.byPeriod[i + 1] ?? 0}
              </TableCell>
            ))}
            <TableCell className="text-right font-bold">
              {score.byTeam[id]?.total ?? 0}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SoftballResults() {
  const finalized = softballGames.filter((game) => game.status === "finalized");
  const upcoming = softballGames.filter((game) => game.status === "scheduled");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl">
          Softbol · Resultados
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {finalized.map((game) => {
          const score = computeScore(eventsByGameId.get(game.id) ?? [], softballConfig);
          const away = score.byTeam[game.awayTeamId]?.total ?? 0;
          const home = score.byTeam[game.homeTeamId]?.total ?? 0;
          return (
            <div
              key={game.id}
              className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3"
            >
              <div className="flex min-w-0 flex-col gap-1 text-sm">
                <TeamLabel teamId={game.awayTeamId} />
                <TeamLabel teamId={game.homeTeamId} />
              </div>
              <div className="flex flex-col items-end gap-1 text-sm font-semibold tabular-nums">
                <span>{away}</span>
                <span>{home}</span>
              </div>
              <div className="flex w-24 flex-col items-end gap-1">
                <Badge variant="secondary">Final</Badge>
                <span className="text-xs text-muted-foreground">
                  {dateFormat.format(new Date(game.scheduledAt))}
                </span>
              </div>
            </div>
          );
        })}
        {upcoming.map((game) => (
          <div
            key={game.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-dashed px-4 py-3"
          >
            <div className="flex min-w-0 flex-col gap-1 text-sm">
              <TeamLabel teamId={game.awayTeamId} />
              <TeamLabel teamId={game.homeTeamId} />
            </div>
            <div className="flex w-32 flex-col items-end gap-1">
              <Badge variant="outline">Programado</Badge>
              <span className="text-xs text-muted-foreground">
                {dateFormat.format(new Date(game.scheduledAt))}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FeaturedGame() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl">
          Juego destacado · Coyotes vs Huracanes
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Línea por entrada calculada desde el stream de eventos. Este juego
          incluye una carrera fantasma anulada con un evento de corrección
          (el marcador ya la excluye) y terminó con walk-off en la 7ª.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <LineScore gameUuid={gameId(1)} periods={7} config={softballConfig} />
      </CardContent>
    </Card>
  );
}

function BasketballSection() {
  const standings = computeStandings(basketballGames, eventsByGameId, basketballConfig);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl">
          Basquetbol · Mismo motor, otra config
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Panteras vs Lobos por cuartos. Cero código específico del deporte:
          solo cambia el <code className="font-mono text-xs">config jsonb</code>.
          La derrota suma 1 punto (estilo FIBA), también por configuración.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 overflow-x-auto">
        <LineScore gameUuid={gameId(11)} periods={4} config={basketballConfig} />
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          {standings.map((row) => (
            <span key={row.teamId} className="rounded-md border px-2 py-1">
              <TeamLabel teamId={row.teamId} /> · {row.wins}-{row.losses} ·{" "}
              {row.points} pts
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Leaders() {
  const softballEvents = softballGames.flatMap(
    (game) => eventsByGameId.get(game.id) ?? [],
  );
  const softballStats = computePlayerStats(softballEvents, softballConfig);
  const hitLeaders = [...softballStats.entries()]
    .map(([playerId, line]) => ({
      playerId,
      hits: line["H"] ?? 0,
      runs: line["R"] ?? 0,
    }))
    .sort((a, b) => b.hits - a.hits || b.runs - a.runs)
    .slice(0, 5);

  const basketballStats = computePlayerStats(
    eventsByGameId.get(gameId(11)) ?? [],
    basketballConfig,
  );
  const pointLeaders = [...basketballStats.entries()]
    .map(([playerId, line]) => ({ playerId, points: line["PTS"] ?? 0 }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);

  const playerLabel = (id: string) => {
    const player = playerById.get(id);
    const team = teamById.get(teamOfPlayer.get(id) ?? "");
    return `${player?.firstName ?? "?"} ${player?.lastName ?? ""} · ${team?.name ?? ""}`;
  };

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">
            Líderes de hits (softbol)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-2 text-sm">
            {hitLeaders.map((leader, index) => (
              <li key={leader.playerId} className="flex justify-between gap-2">
                <span className="truncate">
                  <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                  {playerLabel(leader.playerId)}
                </span>
                <span className="font-semibold tabular-nums">
                  {leader.hits} H · {leader.runs} C
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">
            Líderes de puntos (basquetbol)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-2 text-sm">
            {pointLeaders.map((leader, index) => (
              <li key={leader.playerId} className="flex justify-between gap-2">
                <span className="truncate">
                  <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                  {playerLabel(leader.playerId)}
                </span>
                <span className="font-semibold tabular-nums">
                  {leader.points} pts
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DemoPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="font-display text-3xl">
            ALV <span className="text-brand-silver">Sport</span>
          </Link>
          <Badge variant="outline" className="border-brand-amber/50 text-brand-amber">
            Vista previa · datos seed
          </Badge>
        </div>
        <div className="bg-brand-gradient h-0.5 w-full rounded-full" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Esta página se calcula en el servidor con el motor de{" "}
          <code className="font-mono text-xs">lib/engine</code> directamente
          desde los datos seed — sin base de datos. Es la demostración de la
          Fase 0; el sitio público real (Fase 2) leerá de Supabase en tiempo
          real.
        </p>
      </header>

      <SoftballStandings />
      <FeaturedGame />
      <SoftballResults />
      <BasketballSection />
      <Leaders />
    </main>
  );
}
