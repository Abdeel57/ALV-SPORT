import { sportConfigSchema, type SportConfig } from "@/lib/engine/sport-config";

/**
 * Softbol lento (slowpitch), 7 entradas. Solo `run` afecta el marcador:
 * un cuadrangular se registra como `home_run` (estadística) más un evento
 * `run` por cada corredor que anota — verdad granular, sin casos especiales.
 */
export const softballConfig: SportConfig = sportConfigSchema.parse({
  version: 1,
  eventTypes: [
    {
      key: "run",
      label: "Carrera",
      scoreDelta: 1,
      playerStats: [{ key: "R" }],
      requiresPlayer: true,
    },
    {
      key: "single",
      label: "Sencillo",
      playerStats: [{ key: "H" }, { key: "AB" }],
      requiresPlayer: true,
    },
    {
      key: "double",
      label: "Doble",
      playerStats: [{ key: "2B" }, { key: "H" }, { key: "AB" }],
      requiresPlayer: true,
    },
    {
      key: "triple",
      label: "Triple",
      playerStats: [{ key: "3B" }, { key: "H" }, { key: "AB" }],
      requiresPlayer: true,
    },
    {
      key: "home_run",
      label: "Cuadrangular",
      playerStats: [{ key: "HR" }, { key: "H" }, { key: "AB" }],
      requiresPlayer: true,
    },
    {
      key: "out",
      label: "Out",
      playerStats: [{ key: "AB" }],
      requiresPlayer: true,
    },
    {
      key: "strikeout",
      label: "Ponche",
      playerStats: [{ key: "SO" }, { key: "AB" }],
      requiresPlayer: true,
    },
    {
      key: "walk",
      label: "Base por bolas",
      playerStats: [{ key: "BB" }],
      requiresPlayer: true,
    },
    {
      key: "rbi",
      label: "Carrera impulsada",
      playerStats: [{ key: "RBI" }],
      requiresPlayer: true,
    },
    {
      key: "error",
      label: "Error",
      playerStats: [{ key: "E" }],
      requiresPlayer: true,
    },
  ],
  periodStructure: {
    type: "innings",
    count: 7,
    label: "Entrada",
    allowsTies: false,
    // Extra innings ilimitados hasta romper el empate.
    overtime: { enabled: true, maxExtra: null },
  },
  standings: {
    rankBy: "points",
    pointsFor: { win: 2, tie: 1, loss: 0 },
    // Desempate: head-to-head → diferencia de carreras → carreras anotadas.
    tiebreakers: ["head_to_head", "score_diff", "score_for"],
  },
  playerStatDefs: [
    { key: "R", label: "Carreras" },
    { key: "H", label: "Hits" },
    { key: "AB", label: "Turnos al bat" },
    { key: "2B", label: "Dobles" },
    { key: "3B", label: "Triples" },
    { key: "HR", label: "Cuadrangulares" },
    { key: "SO", label: "Ponches" },
    { key: "BB", label: "Bases por bolas" },
    { key: "RBI", label: "Carreras impulsadas" },
    { key: "E", label: "Errores" },
  ],
});
