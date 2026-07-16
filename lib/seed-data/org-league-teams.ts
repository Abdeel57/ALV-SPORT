import type { SportConfig } from "@/lib/engine/sport-config";
import { basketballConfig } from "./basketball-config";
import {
  COURT_FIELD_1_ID,
  COURT_FIELD_2_ID,
  COURT_INDOOR_ID,
  DIVISION_BASKETBALL_ID,
  DIVISION_SOFTBALL_ID,
  LEAGUE_BASKETBALL_ID,
  LEAGUE_SOFTBALL_ID,
  ORG_ID,
  SEASON_BASKETBALL_ID,
  SEASON_SOFTBALL_ID,
  SPORT_BASKETBALL_ID,
  SPORT_SOFTBALL_ID,
  VENUE_ID,
  playerId,
  teamId,
} from "./ids";
import { softballConfig } from "./softball-config";

export interface SeedOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface SeedSport {
  id: string;
  key: string;
  name: string;
  config: SportConfig;
  /** null = fila del catálogo global de deportes. */
  organizationId: string | null;
}

export interface SeedLeague {
  id: string;
  organizationId: string;
  sportId: string;
  name: string;
  slug: string;
  isPublished: boolean;
}

export interface SeedSeason {
  id: string;
  leagueId: string;
  name: string;
  status: "draft" | "active" | "completed" | "archived";
  startsOn: string;
  endsOn: string;
}

export interface SeedDivision {
  id: string;
  seasonId: string;
  name: string;
  sortOrder: number;
}

export interface SeedVenue {
  id: string;
  organizationId: string;
  name: string;
  address: string;
}

export interface SeedCourt {
  id: string;
  venueId: string;
  name: string;
}

export interface SeedTeam {
  id: string;
  organizationId: string;
  divisionId: string;
  name: string;
  slug: string;
  color: string;
}

export interface SeedPlayer {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
}

export interface SeedRosterEntry {
  teamId: string;
  playerId: string;
  jerseyNumber: string;
  position: string;
}

export const organization: SeedOrganization = {
  id: ORG_ID,
  name: "Liga Deportiva del Valle",
  slug: "valle",
};

export const sports: SeedSport[] = [
  {
    id: SPORT_SOFTBALL_ID,
    key: "softball",
    name: "Softbol",
    config: softballConfig,
    organizationId: null,
  },
  {
    id: SPORT_BASKETBALL_ID,
    key: "basketball",
    name: "Basquetbol",
    config: basketballConfig,
    organizationId: null,
  },
];

export const leagues: SeedLeague[] = [
  {
    id: LEAGUE_SOFTBALL_ID,
    organizationId: ORG_ID,
    sportId: SPORT_SOFTBALL_ID,
    name: "Liga de Softbol del Valle",
    slug: "softbol",
    isPublished: true,
  },
  {
    id: LEAGUE_BASKETBALL_ID,
    organizationId: ORG_ID,
    sportId: SPORT_BASKETBALL_ID,
    name: "Liga de Basquetbol del Valle",
    slug: "basquetbol",
    isPublished: true,
  },
];

export const seasons: SeedSeason[] = [
  {
    id: SEASON_SOFTBALL_ID,
    leagueId: LEAGUE_SOFTBALL_ID,
    name: "Temporada Verano 2026",
    status: "active",
    startsOn: "2026-06-06",
    endsOn: "2026-08-29",
  },
  {
    id: SEASON_BASKETBALL_ID,
    leagueId: LEAGUE_BASKETBALL_ID,
    name: "Temporada Verano 2026",
    status: "active",
    startsOn: "2026-06-27",
    endsOn: "2026-08-29",
  },
];

export const divisions: SeedDivision[] = [
  {
    id: DIVISION_SOFTBALL_ID,
    seasonId: SEASON_SOFTBALL_ID,
    name: "Primera Fuerza",
    sortOrder: 0,
  },
  {
    id: DIVISION_BASKETBALL_ID,
    seasonId: SEASON_BASKETBALL_ID,
    name: "Única",
    sortOrder: 0,
  },
];

export const venues: SeedVenue[] = [
  {
    id: VENUE_ID,
    organizationId: ORG_ID,
    name: "Deportivo Municipal El Valle",
    address: "Av. de los Deportes 100, El Valle",
  },
];

export const courts: SeedCourt[] = [
  { id: COURT_FIELD_1_ID, venueId: VENUE_ID, name: "Campo 1" },
  { id: COURT_FIELD_2_ID, venueId: VENUE_ID, name: "Campo 2" },
  { id: COURT_INDOOR_ID, venueId: VENUE_ID, name: "Cancha Techada" },
];

/** Índices 1-6: softbol. Índices 7-8: basquetbol. */
export const SOFTBALL_TEAM_INDICES = [1, 2, 3, 4, 5, 6] as const;
export const BASKETBALL_TEAM_INDICES = [7, 8] as const;

const teamDefs: ReadonlyArray<{
  index: number;
  divisionId: string;
  name: string;
  slug: string;
  color: string;
}> = [
  { index: 1, divisionId: DIVISION_SOFTBALL_ID, name: "Coyotes", slug: "coyotes", color: "#B91C1C" },
  { index: 2, divisionId: DIVISION_SOFTBALL_ID, name: "Huracanes", slug: "huracanes", color: "#1D4ED8" },
  { index: 3, divisionId: DIVISION_SOFTBALL_ID, name: "Mineros", slug: "mineros", color: "#B45309" },
  { index: 4, divisionId: DIVISION_SOFTBALL_ID, name: "Bravos", slug: "bravos", color: "#15803D" },
  { index: 5, divisionId: DIVISION_SOFTBALL_ID, name: "Cañeros", slug: "caneros", color: "#7C3AED" },
  { index: 6, divisionId: DIVISION_SOFTBALL_ID, name: "Halcones", slug: "halcones", color: "#0F766E" },
  { index: 7, divisionId: DIVISION_BASKETBALL_ID, name: "Panteras", slug: "panteras", color: "#DB2777" },
  { index: 8, divisionId: DIVISION_BASKETBALL_ID, name: "Lobos", slug: "lobos", color: "#4B5563" },
];

export const teams: SeedTeam[] = teamDefs.map((def) => ({
  id: teamId(def.index),
  organizationId: ORG_ID,
  divisionId: def.divisionId,
  name: def.name,
  slug: def.slug,
  color: def.color,
}));

const firstNames = [
  "José", "Luis", "Carlos", "Miguel", "Juan", "Roberto", "Fernando",
  "Alejandro", "Ricardo", "Eduardo", "Manuel", "Jorge", "Arturo", "Sergio",
  "Raúl", "Héctor", "Iván", "Óscar", "Diego", "Marco",
] as const;

const lastNames = [
  "Hernández", "García", "Martínez", "López", "González", "Pérez",
  "Rodríguez", "Sánchez", "Ramírez", "Cruz", "Flores", "Gómez", "Díaz",
  "Reyes", "Torres", "Vázquez", "Castillo", "Mendoza", "Rojas", "Silva",
] as const;

const SOFTBALL_POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "UT"] as const;
const BASKETBALL_POSITIONS = ["PG", "SG", "SF", "PF", "C", "UT", "UT", "UT"] as const;

export const SOFTBALL_ROSTER_SIZE = 10;
export const BASKETBALL_ROSTER_SIZE = 8;

function pick<T>(list: readonly T[], index: number): T {
  const item = list[index % list.length];
  if (item === undefined) throw new Error("lista de nombres vacía");
  return item;
}

export const players: SeedPlayer[] = [];
export const rosters: SeedRosterEntry[] = [];

for (const def of teamDefs) {
  const isBasketball = def.divisionId === DIVISION_BASKETBALL_ID;
  const rosterSize = isBasketball ? BASKETBALL_ROSTER_SIZE : SOFTBALL_ROSTER_SIZE;
  const positions = isBasketball ? BASKETBALL_POSITIONS : SOFTBALL_POSITIONS;
  for (let playerIndex = 1; playerIndex <= rosterSize; playerIndex += 1) {
    players.push({
      id: playerId(def.index, playerIndex),
      organizationId: ORG_ID,
      firstName: pick(firstNames, def.index * 3 + playerIndex * 7),
      lastName: pick(lastNames, def.index * 5 + playerIndex * 11),
    });
    rosters.push({
      teamId: teamId(def.index),
      playerId: playerId(def.index, playerIndex),
      jerseyNumber: String(playerIndex),
      position: pick(positions, playerIndex - 1),
    });
  }
}
