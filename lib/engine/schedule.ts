/**
 * Generador de calendario round-robin (método del círculo), puro y
 * determinista. La UI del admin lo usa para la vista previa; publicar
 * inserta los partidos resultantes.
 */

export interface RoundRobinFixture {
  round: number;
  homeTeamId: string;
  awayTeamId: string;
}

export interface SlotConstraints {
  /** Primera fecha candidata (YYYY-MM-DD). */
  startDate: string;
  /** Días de la semana con juegos (0=domingo … 6=sábado). */
  weekdays: number[];
  /** Horarios disponibles por fecha ("18:00"). */
  times: string[];
  /** Canchas disponibles. */
  courtIds: string[];
  /** Días mínimos de descanso entre partidos del mismo equipo. */
  minRestDays: number;
  /** Offset UTC en formato ISO (México centro: "-06:00"). */
  utcOffset?: string;
}

export interface ScheduledFixture extends RoundRobinFixture {
  scheduledAt: string;
  courtId: string;
}

const BYE = "__bye__";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rondas por método del círculo: n-1 jornadas (n par; con n impar se
 * agrega descanso). La localía se alterna por jornada; la vuelta doble
 * refleja el rol de local.
 */
export function generateRoundRobin(
  teamIds: readonly string[],
  options: { doubleRound?: boolean } = {},
): RoundRobinFixture[] {
  const { doubleRound = false } = options;
  if (teamIds.length < 2) return [];
  const circle = [...teamIds];
  if (circle.length % 2 === 1) circle.push(BYE);
  const n = circle.length;
  const roundsCount = n - 1;
  const fixtures: RoundRobinFixture[] = [];

  let rotation = [...circle];
  for (let round = 1; round <= roundsCount; round += 1) {
    for (let i = 0; i < n / 2; i += 1) {
      const a = rotation[i];
      const b = rotation[n - 1 - i];
      if (!a || !b || a === BYE || b === BYE) continue;
      // Alternar localía por jornada para repartirla de forma justa.
      const [home, away] = round % 2 === 1 ? [a, b] : [b, a];
      fixtures.push({ round, homeTeamId: home, awayTeamId: away });
    }
    // Rotación: el primero queda fijo, el resto gira una posición.
    const fixed = rotation[0];
    const rest = rotation.slice(1);
    const last = rest.pop();
    rotation = fixed !== undefined && last !== undefined
      ? [fixed, last, ...rest]
      : rotation;
  }

  if (doubleRound) {
    const secondLeg = fixtures.map((fixture) => ({
      round: fixture.round + roundsCount,
      homeTeamId: fixture.awayTeamId,
      awayTeamId: fixture.homeTeamId,
    }));
    fixtures.push(...secondLeg);
  }
  return fixtures;
}

function dateAtMidnightUtc(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function toDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Fechas válidas (día de la semana permitido) a partir de un punto. */
function nextValidDate(fromMs: number, weekdays: readonly number[]): number {
  let cursor = fromMs;
  for (let i = 0; i < 366; i += 1) {
    if (weekdays.includes(new Date(cursor).getUTCDay())) return cursor;
    cursor += DAY_MS;
  }
  throw new Error("No hay días de la semana válidos en las restricciones");
}

/**
 * Asigna fecha/hora/cancha jornada por jornada respetando la capacidad
 * (horarios × canchas por fecha) y el descanso mínimo de cada equipo.
 * Si una jornada no cabe en una fecha, se desborda a la siguiente válida.
 */
export function assignSlots(
  fixtures: readonly RoundRobinFixture[],
  constraints: SlotConstraints,
): ScheduledFixture[] {
  const { startDate, weekdays, times, courtIds, minRestDays } = constraints;
  const utcOffset = constraints.utcOffset ?? "-06:00";
  if (times.length === 0 || courtIds.length === 0 || weekdays.length === 0) {
    throw new Error("Se requieren horarios, canchas y días de juego");
  }

  const rounds = new Map<number, RoundRobinFixture[]>();
  for (const fixture of fixtures) {
    const list = rounds.get(fixture.round) ?? [];
    list.push(fixture);
    rounds.set(fixture.round, list);
  }

  const lastPlayedMs = new Map<string, number>();
  const scheduled: ScheduledFixture[] = [];
  let dateCursor = nextValidDate(dateAtMidnightUtc(startDate), weekdays);

  for (const round of [...rounds.keys()].sort((a, b) => a - b)) {
    const games = rounds.get(round) ?? [];
    // La jornada arranca cuando TODOS sus equipos cumplieron el descanso.
    let earliest = dateCursor;
    for (const game of games) {
      for (const teamId of [game.homeTeamId, game.awayTeamId]) {
        const last = lastPlayedMs.get(teamId);
        if (last !== undefined) {
          earliest = Math.max(earliest, last + (minRestDays + 1) * DAY_MS);
        }
      }
    }
    let gameDateMs = nextValidDate(earliest, weekdays);
    let slotIndex = 0;
    const slotsPerDate = times.length * courtIds.length;

    for (const game of games) {
      if (slotIndex >= slotsPerDate) {
        // Desbordar a la siguiente fecha válida.
        gameDateMs = nextValidDate(gameDateMs + DAY_MS, weekdays);
        slotIndex = 0;
      }
      const time = times[slotIndex % times.length];
      const courtId = courtIds[Math.floor(slotIndex / times.length)];
      if (!time || !courtId) throw new Error("Slot inválido");
      scheduled.push({
        ...game,
        scheduledAt: `${toDateString(gameDateMs)}T${time}:00${utcOffset}`,
        courtId,
      });
      lastPlayedMs.set(game.homeTeamId, gameDateMs);
      lastPlayedMs.set(game.awayTeamId, gameDateMs);
      slotIndex += 1;
    }
    dateCursor = nextValidDate(gameDateMs + DAY_MS, weekdays);
  }
  return scheduled;
}
