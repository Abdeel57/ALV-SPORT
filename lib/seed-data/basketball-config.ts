import { sportConfigSchema, type SportConfig } from "@/lib/engine/sport-config";

/**
 * Basquetbol, 4 cuartos. Existe en el seed para demostrar que el motor es
 * genérico: mismos módulos de cálculo, distinta configuración.
 */
export const basketballConfig: SportConfig = sportConfigSchema.parse({
  version: 1,
  eventTypes: [
    {
      key: "fg2",
      label: "Canasta de 2",
      scoreDelta: 2,
      playerStats: [{ key: "FG2" }, { key: "PTS", increment: 2 }],
      requiresPlayer: true,
    },
    {
      key: "fg3",
      label: "Triple",
      scoreDelta: 3,
      playerStats: [{ key: "FG3" }, { key: "PTS", increment: 3 }],
      requiresPlayer: true,
    },
    {
      key: "ft_made",
      label: "Tiro libre anotado",
      scoreDelta: 1,
      playerStats: [{ key: "FT" }, { key: "PTS" }],
      requiresPlayer: true,
    },
    {
      key: "rebound",
      label: "Rebote",
      playerStats: [{ key: "REB" }],
      requiresPlayer: true,
    },
    {
      key: "assist",
      label: "Asistencia",
      playerStats: [{ key: "AST" }],
      requiresPlayer: true,
    },
    {
      key: "steal",
      label: "Robo",
      playerStats: [{ key: "STL" }],
      requiresPlayer: true,
    },
    {
      key: "block",
      label: "Bloqueo",
      playerStats: [{ key: "BLK" }],
      requiresPlayer: true,
    },
    {
      key: "turnover",
      label: "Pérdida",
      playerStats: [{ key: "TO" }],
      requiresPlayer: true,
    },
    {
      key: "foul",
      label: "Falta personal",
      playerStats: [{ key: "PF" }],
      requiresPlayer: true,
    },
  ],
  periodStructure: {
    type: "quarters",
    count: 4,
    label: "Cuarto",
    allowsTies: false,
    overtime: { enabled: true, maxExtra: null },
  },
  standings: {
    rankBy: "points",
    // Estilo FIBA: la derrota también suma un punto.
    pointsFor: { win: 2, tie: 0, loss: 1 },
    tiebreakers: ["head_to_head", "score_diff", "score_for"],
  },
  playerStatDefs: [
    { key: "PTS", label: "Puntos" },
    { key: "FG2", label: "Canastas de 2" },
    { key: "FG3", label: "Triples" },
    { key: "FT", label: "Tiros libres" },
    { key: "REB", label: "Rebotes" },
    { key: "AST", label: "Asistencias" },
    { key: "STL", label: "Robos" },
    { key: "BLK", label: "Bloqueos" },
    { key: "TO", label: "Pérdidas" },
    { key: "PF", label: "Faltas personales" },
  ],
});
