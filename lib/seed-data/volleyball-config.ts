import { sportConfigSchema, type SportConfig } from "@/lib/engine/sport-config";

/**
 * Voleibol — LA PRUEBA de que el motor es genérico: ganador por SETS
 * (`winnerBy: "periods_won"`), no por puntos totales. Cero cambios al
 * motor: solo esta configuración. Guía completa en el README.
 */
export const volleyballConfig: SportConfig = sportConfigSchema.parse({
  version: 1,
  eventTypes: [
    {
      key: "attack_point",
      label: "Punto de ataque",
      scoreDelta: 1,
      playerStats: [{ key: "ATQ" }, { key: "PTS" }],
      requiresPlayer: true,
    },
    {
      key: "ace",
      label: "Ace",
      scoreDelta: 1,
      playerStats: [{ key: "ACE" }, { key: "PTS" }],
      requiresPlayer: true,
    },
    {
      key: "block_point",
      label: "Punto de bloqueo",
      scoreDelta: 1,
      playerStats: [{ key: "BLK" }, { key: "PTS" }],
      requiresPlayer: true,
    },
    {
      key: "opponent_error",
      label: "Error del rival",
      scoreDelta: 1,
      playerStats: [],
      requiresPlayer: false,
    },
    {
      key: "dig",
      label: "Defensa",
      playerStats: [{ key: "DIG" }],
      requiresPlayer: true,
    },
    {
      key: "assist",
      label: "Asistencia",
      playerStats: [{ key: "AST" }],
      requiresPlayer: true,
    },
    {
      key: "service_error",
      label: "Error de servicio",
      playerStats: [{ key: "SE" }],
      requiresPlayer: true,
    },
  ],
  periodStructure: {
    type: "sets",
    count: 5,
    label: "Set",
    allowsTies: false,
    overtime: { enabled: false, maxExtra: null },
  },
  standings: {
    rankBy: "points",
    pointsFor: { win: 3, tie: 0, loss: 0 },
    tiebreakers: ["head_to_head", "score_diff", "score_for"],
    // El ganador del partido es quien gana más SETS, no más puntos.
    winnerBy: "periods_won",
  },
  playerStatDefs: [
    { key: "PTS", label: "Puntos" },
    { key: "ATQ", label: "Puntos de ataque" },
    { key: "ACE", label: "Aces" },
    { key: "BLK", label: "Puntos de bloqueo" },
    { key: "DIG", label: "Defensas" },
    { key: "AST", label: "Asistencias" },
    { key: "SE", label: "Errores de servicio" },
  ],
});
