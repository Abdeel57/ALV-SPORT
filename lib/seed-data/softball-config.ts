import { sportConfigSchema, type SportConfig } from "@/lib/engine/sport-config";

/**
 * Softbol lento (slowpitch), 7 entradas.
 *
 * Solo `run` afecta el marcador: un cuadrangular se registra como `home_run`
 * (estadística) más un evento `run` por cada corredor que anota — verdad
 * granular, sin casos especiales. El resto de tipos alimentan la libreta
 * digital (lib/engine/scorebook): lanzamientos, movimientos de corredores,
 * outs de corredor, sustituciones y flujo de entradas. Ninguno suma al
 * marcador; el SQL de standings no cambia.
 */
export const softballConfig: SportConfig = sportConfigSchema.parse({
  version: 1,
  eventTypes: [
    // --- Marcador ---
    {
      key: "run",
      label: "Carrera",
      scoreDelta: 1,
      playerStats: [{ key: "R" }],
      requiresPlayer: true,
    },

    // --- Resultados del bateador (cierran la aparición) ---
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
      key: "intentional_walk",
      label: "Base intencional",
      playerStats: [{ key: "BB" }],
      requiresPlayer: true,
    },
    {
      key: "hbp",
      label: "Golpeado",
      playerStats: [{ key: "HBP" }],
      requiresPlayer: true,
    },
    {
      key: "fielders_choice",
      label: "Elección del fildeador",
      playerStats: [{ key: "AB" }],
      requiresPlayer: true,
    },
    {
      key: "reach_on_error",
      label: "Llega por error",
      playerStats: [{ key: "AB" }],
      requiresPlayer: true,
    },
    {
      key: "sac_fly",
      label: "Elevado de sacrificio",
      playerStats: [{ key: "SF" }],
      requiresPlayer: true,
    },
    {
      key: "sac_bunt",
      label: "Toque de sacrificio",
      playerStats: [{ key: "SH" }],
      requiresPlayer: true,
    },
    {
      key: "interference",
      label: "Interferencia u obstrucción",
      requiresPlayer: true,
    },
    {
      key: "rbi",
      label: "Carrera impulsada",
      playerStats: [{ key: "RBI" }],
      requiresPlayer: true,
    },

    // --- Lanzamientos (cuenta) ---
    { key: "pitch_ball", label: "Bola", requiresPlayer: true },
    { key: "pitch_strike", label: "Strike", requiresPlayer: true },
    { key: "pitch_foul", label: "Foul", requiresPlayer: true },

    // --- Corredores ---
    { key: "runner_advance", label: "Avance de corredor", requiresPlayer: true },
    { key: "runner_out", label: "Corredor out", requiresPlayer: true },
    {
      key: "stolen_base",
      label: "Base robada",
      playerStats: [{ key: "SB" }],
      requiresPlayer: true,
    },
    {
      key: "caught_stealing",
      label: "Out robando",
      playerStats: [{ key: "CS" }],
      requiresPlayer: true,
    },
    { key: "pickoff", label: "Out por pickoff", requiresPlayer: true },

    // --- Defensa y batería ---
    {
      key: "error",
      label: "Error",
      playerStats: [{ key: "E" }],
      requiresPlayer: true,
    },
    { key: "wild_pitch", label: "Lanzamiento descontrolado", requiresPlayer: true },
    { key: "passed_ball", label: "Passed ball", requiresPlayer: true },
    { key: "balk", label: "Balk", requiresPlayer: true },

    // --- Alineación y flujo ---
    { key: "substitution", label: "Sustitución", requiresPlayer: true },
    { key: "defensive_change", label: "Cambio defensivo" },
    { key: "half_inning_end", label: "Fin de media entrada" },
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
    // La liga ordena por porcentaje ganado (G ÷ JJ, en milésimas), no por puntos.
    rankBy: "win_pct",
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
    { key: "HBP", label: "Golpeados" },
    { key: "RBI", label: "Carreras impulsadas" },
    { key: "SF", label: "Elevados de sacrificio" },
    { key: "SH", label: "Toques de sacrificio" },
    { key: "SB", label: "Bases robadas" },
    { key: "CS", label: "Outs robando" },
    { key: "E", label: "Errores" },
  ],
});
