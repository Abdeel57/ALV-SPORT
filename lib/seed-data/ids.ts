/**
 * UUIDs literales y deterministas para el seed. Prefijo por entidad:
 *   01 org · 02 sports · 03 leagues · 04 seasons · 05 divisions · 06 venues
 *   07 courts · 10 teams · 20 players · 30 games · 40 events · a0 auth.users
 * El tercer y cuarto grupo (4000-8000) mantienen formato UUID v4 válido.
 */

const HEX_SUFFIX_LENGTH = 12;

function seedUuid(prefix: string, suffix: number): string {
  const hex = suffix.toString(16).padStart(HEX_SUFFIX_LENGTH, "0");
  return `${prefix}-0000-4000-8000-${hex}`;
}

/** Usuario administrador ficticio del seed (ver README para reemplazarlo). */
export const SEED_ADMIN_USER_ID = seedUuid("a0000000", 1);

export const ORG_ID = seedUuid("01000000", 1);

export const SPORT_SOFTBALL_ID = seedUuid("02000000", 1);
export const SPORT_BASKETBALL_ID = seedUuid("02000000", 2);

export const LEAGUE_SOFTBALL_ID = seedUuid("03000000", 1);
export const LEAGUE_BASKETBALL_ID = seedUuid("03000000", 2);

export const SEASON_SOFTBALL_ID = seedUuid("04000000", 1);
export const SEASON_BASKETBALL_ID = seedUuid("04000000", 2);

export const DIVISION_SOFTBALL_ID = seedUuid("05000000", 1);
export const DIVISION_BASKETBALL_ID = seedUuid("05000000", 2);

export const VENUE_ID = seedUuid("06000000", 1);

export const COURT_FIELD_1_ID = seedUuid("07000000", 1);
export const COURT_FIELD_2_ID = seedUuid("07000000", 2);
export const COURT_INDOOR_ID = seedUuid("07000000", 3);

/** Equipos 1-6 softbol, 7-8 basquetbol. */
export function teamId(index: number): string {
  return seedUuid("10000000", index);
}

/** Jugadores: teamIndex * 100 + jerseyIndex. */
export function playerId(teamIndex: number, playerIndex: number): string {
  return seedUuid("20000000", teamIndex * 100 + playerIndex);
}

export function gameId(index: number): string {
  return seedUuid("30000000", index);
}

/** Eventos: gameIndex * 100000 + seq dentro del juego. */
export function eventId(gameIndex: number, seq: number): string {
  return seedUuid("40000000", gameIndex * 100_000 + seq);
}
