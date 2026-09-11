import type { RulesProfile } from "./rules";
import type { BaseIndex, OccupiedBase, PAResultKind } from "./types";

/**
 * Catálogo de jugadas de la mesa: la organización de la aplicación de
 * referencia (outs por tipo, llegadas a base, combinaciones con error,
 * corredores), pero como datos: extensible, filtrable por reglamento y
 * situación, y con atajos declarados junto a cada opción.
 */

export type CatalogGroup =
  | "out_quick"
  | "ground_out"
  | "fly_out"
  | "pop_out"
  | "line_out"
  | "foul_out"
  | "special_out"
  | "double_play"
  | "hit"
  | "hit_error"
  | "hit_stretch"
  | "reach_error"
  | "walk"
  | "reach_other";

export type RunnerProposal = "hold" | "advance1" | "advance2" | "score" | "forced";

export type Requirement =
  | "bunting"
  | "stealing"
  | "dropped_third_strike"
  | "runners_on"
  | "runner_on_third"
  | "fewer_than_two_outs";

export interface CatalogEntry {
  /** Id estable: "out.ground.6-3". */
  key: string;
  group: CatalogGroup;
  /** Etiqueta es-MX. */
  label: string;
  /** Explicación de una línea (como en la referencia). */
  description?: string;
  /** Código de libreta que producirá ("6-3", "F8", "1B+E"). */
  code: string;
  /** Tecla dentro del menú (sin modificadores). */
  shortcut?: string;
  result: PAResultKind;
  /** Subtipo para payload.kind. */
  kind?: string;
  /** Secuencia defensiva por omisión (números de posición). */
  fielders?: number[];
  /** "fixed" no se edita; "editable" se propone; "required" el anotador la escribe. */
  sequence?: "fixed" | "editable" | "required";
  /** Base final del bateador si no es la implícita del resultado. */
  batterTo?: BaseIndex;
  /** Avance adicional del bateador por error tras llegar a base. */
  errorAdvanceTo?: BaseIndex;
  /** El bateador queda out intentando alcanzar esta base tras su hit. */
  stretchOutAt?: 2 | 3 | 4;
  /** Un fildeador comete error en la jugada (se pide su posición). */
  needsErrorFielder?: boolean;
  /** Propuesta para los corredores en base (el anotador confirma). */
  runners: RunnerProposal;
  /** Condiciones para que aparezca. */
  requires?: Requirement[];
  /** Si los corredores que anotan en esta jugada generan carrera impulsada. */
  rbiEligible: boolean;
}

export interface CatalogGroupDef {
  group: CatalogGroup;
  label: string;
  hint?: string;
}

export const OUT_GROUPS: CatalogGroupDef[] = [
  { group: "out_quick", label: "Frecuentes" },
  { group: "ground_out", label: "Rodados", hint: "secuencia de fildeadores" },
  { group: "fly_out", label: "Elevados" },
  { group: "pop_out", label: "Elevados al cuadro" },
  { group: "line_out", label: "Líneas" },
  { group: "foul_out", label: "Fouls atrapados" },
  { group: "double_play", label: "Dobles y triples plays" },
  { group: "special_out", label: "Sacrificios y jugadas especiales" },
];

export const REACH_GROUPS: CatalogGroupDef[] = [
  { group: "hit", label: "Hits" },
  { group: "walk", label: "Bases por bolas y golpeados" },
  { group: "hit_error", label: "Hit y avance por error" },
  { group: "hit_stretch", label: "Hit y out al estirar" },
  { group: "reach_error", label: "Llega por error" },
  { group: "reach_other", label: "Elección, interferencias y obstrucción" },
];

const ground = (fielders: number[], shortcut?: string): CatalogEntry => ({
  key: `out.ground.${fielders.join("-")}`,
  group: "ground_out",
  label: `Rodado ${fielders.join("-")}`,
  code: fielders.join("-"),
  shortcut,
  result: "out",
  kind: "ground",
  fielders,
  sequence: "editable",
  runners: "hold",
  rbiEligible: true,
});

const fly = (n: number): CatalogEntry => ({
  key: `out.fly.${n}`,
  group: "fly_out",
  label: `Elevado al ${n}`,
  code: `F${n}`,
  result: "out",
  kind: "fly",
  fielders: [n],
  sequence: "fixed",
  runners: "hold",
  rbiEligible: true,
});

const pop = (n: number): CatalogEntry => ({
  key: `out.pop.${n}`,
  group: "pop_out",
  label: `Elevado al cuadro ${n}`,
  code: `P${n}`,
  result: "out",
  kind: "popup",
  fielders: [n],
  sequence: "fixed",
  runners: "hold",
  rbiEligible: false,
});

const line = (n: number): CatalogEntry => ({
  key: `out.line.${n}`,
  group: "line_out",
  label: `Línea al ${n}`,
  code: `L${n}`,
  result: "out",
  kind: "line",
  fielders: [n],
  sequence: "fixed",
  runners: "hold",
  rbiEligible: true,
});

const foul = (n: number): CatalogEntry => ({
  key: `out.foul.${n}`,
  group: "foul_out",
  label: `Foul atrapado por el ${n}`,
  code: `FF${n}`,
  result: "out",
  kind: "foul_fly",
  fielders: [n],
  sequence: "fixed",
  runners: "hold",
  rbiEligible: true,
});

export const OUT_CATALOG: CatalogEntry[] = [
  // Frecuentes: nombre, código y atajo, como en la referencia.
  {
    key: "out.strikeout.swinging",
    group: "out_quick",
    label: "Ponche tirándole",
    code: "K",
    shortcut: "K",
    result: "strikeout",
    kind: "swinging",
    fielders: [2],
    sequence: "fixed",
    runners: "hold",
    rbiEligible: false,
  },
  {
    key: "out.strikeout.looking",
    group: "out_quick",
    label: "Ponche cantado",
    code: "Kc",
    shortcut: "C",
    result: "strikeout",
    kind: "looking",
    fielders: [2],
    sequence: "fixed",
    runners: "hold",
    rbiEligible: false,
  },
  { ...ground([6, 3], "G"), group: "out_quick", label: "Rodado 6-3" },
  { ...ground([4, 3], "E"), group: "out_quick", label: "Rodado 4-3" },
  { ...ground([5, 3], "R"), group: "out_quick", label: "Rodado 5-3" },
  { ...fly(8), group: "out_quick", shortcut: "V", label: "Elevado al central" },
  {
    key: "out.batted.custom",
    group: "out_quick",
    label: "Out por batazo (escribe la secuencia)",
    description: "Cualquier secuencia defensiva que no esté predefinida, p. ej. 8-2-5.",
    code: "…",
    shortcut: "B",
    result: "out",
    kind: "ground",
    fielders: [],
    sequence: "required",
    runners: "hold",
    rbiEligible: true,
  },

  ground([1, 3], "A"),
  ground([3], "M"),
  ground([3, 1], "D"),
  ground([4, 3]),
  ground([5, 3]),
  ground([6, 3]),
  ground([2, 3]),
  ground([9, 3]),
  ground([1, 4, 3]),
  ground([6, 4, 3]),

  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(fly),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(pop),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(line),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(foul),

  {
    key: "out.dp.ground",
    group: "double_play",
    label: "Doble play por rodado",
    description: "El bateador y un corredor quedan out; se eligen ambos outs paso a paso.",
    code: "DP",
    shortcut: "0",
    result: "out",
    kind: "double_play",
    fielders: [6, 4, 3],
    sequence: "editable",
    runners: "hold",
    requires: ["runners_on", "fewer_than_two_outs"],
    rbiEligible: false,
  },
  {
    key: "out.dp.line",
    group: "double_play",
    label: "Doble play por línea",
    description: "Línea atrapada y corredor sorprendido fuera de base.",
    code: "LDP",
    shortcut: "]",
    result: "out",
    kind: "double_play",
    fielders: [6],
    sequence: "editable",
    runners: "hold",
    requires: ["runners_on", "fewer_than_two_outs"],
    rbiEligible: false,
  },
  {
    key: "out.dp.fly",
    group: "double_play",
    label: "Doble play por elevado (corredor out al pisar y correr)",
    code: "FDP",
    shortcut: "J",
    result: "out",
    kind: "double_play",
    fielders: [8],
    sequence: "editable",
    runners: "hold",
    requires: ["runners_on", "fewer_than_two_outs"],
    rbiEligible: false,
  },
  {
    key: "out.tp",
    group: "double_play",
    label: "Triple play",
    code: "TP",
    shortcut: "T",
    result: "out",
    kind: "triple_play",
    fielders: [],
    sequence: "required",
    runners: "hold",
    requires: ["runners_on", "fewer_than_two_outs"],
    rbiEligible: false,
  },

  {
    key: "out.sac_fly",
    group: "special_out",
    label: "Elevado de sacrificio",
    description: "Elevado atrapado con el que un corredor anota. No cuenta turno; sí impulsada.",
    code: "SF",
    shortcut: "S",
    result: "sac_fly",
    fielders: [8],
    sequence: "editable",
    batterTo: 0,
    runners: "score",
    requires: ["runner_on_third", "fewer_than_two_outs"],
    rbiEligible: true,
  },
  {
    key: "out.sac_bunt",
    group: "special_out",
    label: "Toque de sacrificio",
    description: "El bateador queda out y adelanta corredores. No cuenta turno.",
    code: "SAC",
    shortcut: "H",
    result: "sac_bunt",
    fielders: [1, 3],
    sequence: "editable",
    runners: "advance1",
    requires: ["bunting", "runners_on", "fewer_than_two_outs"],
    rbiEligible: true,
  },
  {
    key: "out.infield_fly",
    group: "special_out",
    label: "Regla del infield fly",
    description: "Bateador out por regla aunque la bola caiga. Los corredores no están forzados.",
    code: "IF",
    shortcut: "I",
    result: "out",
    kind: "infield_fly",
    fielders: [6],
    sequence: "editable",
    runners: "hold",
    requires: ["runners_on", "fewer_than_two_outs"],
    rbiEligible: false,
  },
  {
    key: "out.interference.offensive",
    group: "special_out",
    label: "Interferencia ofensiva",
    description: "El bateador es declarado out por interferir con la defensa.",
    code: "INT",
    shortcut: "O",
    result: "out",
    kind: "interference",
    fielders: [2],
    sequence: "editable",
    runners: "hold",
    rbiEligible: false,
  },
  {
    key: "out.illegal",
    group: "special_out",
    label: "Acción ilegal del bateador",
    description: "Bat ilegal, pisar el plato o batear fuera de turno.",
    code: "OUT",
    shortcut: "L",
    result: "out",
    kind: "illegal",
    fielders: [],
    sequence: "editable",
    runners: "hold",
    rbiEligible: false,
  },
  {
    key: "out.strikeout.foul",
    group: "special_out",
    label: "Ponche por foul con dos strikes",
    description: "Solo en modalidades donde el foul con dos strikes es out.",
    code: "Kf",
    result: "strikeout",
    kind: "foul",
    fielders: [2],
    sequence: "fixed",
    runners: "hold",
    rbiEligible: false,
  },
];

export const REACH_CATALOG: CatalogEntry[] = [
  { key: "reach.single", group: "hit", label: "Sencillo", code: "1B", shortcut: "1", result: "single", runners: "advance1", rbiEligible: true },
  { key: "reach.double", group: "hit", label: "Doble", code: "2B", shortcut: "2", result: "double", runners: "advance2", rbiEligible: true },
  { key: "reach.triple", group: "hit", label: "Triple", code: "3B", shortcut: "3", result: "triple", runners: "score", rbiEligible: true },
  { key: "reach.home_run", group: "hit", label: "Jonrón", code: "HR", shortcut: "4", result: "home_run", runners: "score", rbiEligible: true },
  {
    key: "reach.ground_rule_double",
    group: "hit",
    label: "Doble por regla",
    description: "La bola sale del terreno tras botar: dos bases para todos.",
    code: "2B*",
    shortcut: "G",
    result: "double",
    kind: "ground_rule",
    runners: "advance2",
    rbiEligible: true,
  },
  {
    key: "reach.inside_park_hr",
    group: "hit",
    label: "Jonrón de campo",
    code: "HR*",
    shortcut: "P",
    result: "home_run",
    kind: "inside_park",
    runners: "score",
    rbiEligible: true,
  },
  {
    key: "reach.bunt_single",
    group: "hit",
    label: "Hit de toque",
    code: "1B",
    shortcut: "B",
    result: "single",
    kind: "bunt",
    runners: "advance1",
    requires: ["bunting"],
    rbiEligible: true,
  },
  {
    key: "reach.infield_single",
    group: "hit",
    label: "Hit de cuadro",
    code: "1B",
    shortcut: "N",
    result: "single",
    kind: "infield",
    runners: "hold",
    rbiEligible: true,
  },

  {
    key: "reach.walk",
    group: "walk",
    label: "Base por bolas",
    description: "Los corredores forzados avanzan automáticamente.",
    code: "BB",
    shortcut: "W",
    result: "walk",
    runners: "forced",
    rbiEligible: true,
  },
  {
    key: "reach.intentional_walk",
    group: "walk",
    label: "Base intencional",
    code: "IBB",
    shortcut: "I",
    result: "intentional_walk",
    runners: "forced",
    rbiEligible: true,
  },
  {
    key: "reach.hbp",
    group: "walk",
    label: "Golpeado por lanzamiento",
    code: "HBP",
    shortcut: "H",
    result: "hbp",
    runners: "forced",
    rbiEligible: true,
  },

  {
    key: "reach.single_error_2",
    group: "hit_error",
    label: "Sencillo y llega a 2ª por error",
    description: "Se conserva el sencillo; el error se atribuye al fildeador.",
    code: "1B+E",
    shortcut: "5",
    result: "single",
    errorAdvanceTo: 2,
    needsErrorFielder: true,
    runners: "advance1",
    rbiEligible: true,
  },
  {
    key: "reach.single_error_3",
    group: "hit_error",
    label: "Sencillo y llega a 3ª por error",
    code: "1B+E",
    shortcut: "6",
    result: "single",
    errorAdvanceTo: 3,
    needsErrorFielder: true,
    runners: "advance1",
    rbiEligible: true,
  },
  {
    key: "reach.single_error_home",
    group: "hit_error",
    label: "Sencillo y anota por error",
    description: "La carrera del bateador es sucia (por error).",
    code: "1B+E",
    shortcut: "7",
    result: "single",
    errorAdvanceTo: 4,
    needsErrorFielder: true,
    runners: "advance1",
    rbiEligible: true,
  },

  {
    key: "reach.single_out_2",
    group: "hit_stretch",
    label: "Sencillo, out en 2ª al estirar",
    description: "Se conserva el hit y se anota el out del bateador.",
    code: "1B",
    shortcut: "Q",
    result: "single",
    stretchOutAt: 2,
    fielders: [8, 4],
    sequence: "editable",
    runners: "advance1",
    rbiEligible: true,
  },
  {
    key: "reach.double_out_3",
    group: "hit_stretch",
    label: "Doble, out en 3ª al estirar",
    code: "2B",
    shortcut: "T",
    result: "double",
    stretchOutAt: 3,
    fielders: [9, 5],
    sequence: "editable",
    runners: "advance2",
    rbiEligible: true,
  },

  {
    key: "reach.error_1",
    group: "reach_error",
    label: "Llega a 1ª por error",
    code: "E",
    shortcut: "R",
    result: "reach_on_error",
    needsErrorFielder: true,
    runners: "hold",
    rbiEligible: false,
  },
  {
    key: "reach.error_2",
    group: "reach_error",
    label: "Llega a 2ª por error",
    code: "E",
    shortcut: "8",
    result: "reach_on_error",
    batterTo: 2,
    needsErrorFielder: true,
    runners: "advance1",
    rbiEligible: false,
  },
  {
    key: "reach.error_3",
    group: "reach_error",
    label: "Llega a 3ª por error",
    code: "E",
    shortcut: "9",
    result: "reach_on_error",
    batterTo: 3,
    needsErrorFielder: true,
    runners: "advance2",
    rbiEligible: false,
  },
  {
    key: "reach.sac_fly_dropped",
    group: "reach_error",
    label: "Elevado de sacrificio, safe por bola caída",
    description: "El bateador llega por error en lo que habría sido un elevado de sacrificio.",
    code: "E",
    shortcut: "Y",
    result: "reach_on_error",
    needsErrorFielder: true,
    runners: "score",
    requires: ["runner_on_third"],
    rbiEligible: true,
  },

  {
    key: "reach.fielders_choice",
    group: "reach_other",
    label: "Elección del fildeador",
    description: "La defensa intentó poner out a otro corredor y el bateador llegó a primera.",
    code: "FC",
    shortcut: "F",
    result: "fielders_choice",
    fielders: [6, 4],
    sequence: "editable",
    runners: "hold",
    requires: ["runners_on"],
    rbiEligible: true,
  },
  {
    key: "reach.sac_hit_fc",
    group: "reach_other",
    label: "Toque de sacrificio con elección",
    description: "Intento de sacrificio; la defensa falló el out del corredor y el bateador quedó safe.",
    code: "FC",
    shortcut: "S",
    result: "fielders_choice",
    kind: "sacrifice",
    fielders: [1, 4],
    sequence: "editable",
    runners: "advance1",
    requires: ["bunting", "runners_on"],
    rbiEligible: true,
  },
  {
    key: "reach.catcher_interference",
    group: "reach_other",
    label: "Interferencia del receptor",
    description: "El receptor interfirió con el swing: bateador a primera.",
    code: "CI",
    shortcut: "A",
    result: "interference",
    kind: "catcher",
    runners: "forced",
    rbiEligible: false,
  },
  {
    key: "reach.obstruction",
    group: "reach_other",
    label: "Obstrucción",
    description: "Un defensivo obstruyó al bateador camino a primera.",
    code: "OBS",
    shortcut: "O",
    result: "interference",
    kind: "obstruction",
    runners: "forced",
    rbiEligible: false,
  },
  {
    key: "reach.defensive_interference",
    group: "reach_other",
    label: "Interferencia defensiva",
    code: "INT",
    shortcut: "D",
    result: "interference",
    kind: "defensive",
    runners: "forced",
    rbiEligible: false,
  },
  {
    key: "reach.dropped_third_strike",
    group: "reach_other",
    label: "Tercer strike no retenido",
    description: "El bateador llega a primera; el pitcher recibe el ponche.",
    code: "K-WP",
    shortcut: "Z",
    result: "interference",
    kind: "dropped_third_strike",
    runners: "hold",
    requires: ["dropped_third_strike"],
    rbiEligible: false,
  },
];

export interface AvailabilityContext {
  rules: RulesProfile;
  outs: number;
  runnersOn: OccupiedBase[];
}

export function isAvailable(entry: CatalogEntry, ctx: AvailabilityContext): boolean {
  for (const requirement of entry.requires ?? []) {
    switch (requirement) {
      case "bunting":
        if (!ctx.rules.buntingAllowed) return false;
        break;
      case "stealing":
        if (!ctx.rules.stealingAllowed) return false;
        break;
      case "dropped_third_strike":
        if (!ctx.rules.droppedThirdStrike) return false;
        break;
      case "runners_on":
        if (ctx.runnersOn.length === 0) return false;
        break;
      case "runner_on_third":
        if (!ctx.runnersOn.includes(3)) return false;
        break;
      case "fewer_than_two_outs":
        if (ctx.outs >= 2) return false;
        break;
    }
  }
  if (entry.key === "out.strikeout.foul" && ctx.rules.foulOnThirdStrike !== "out") return false;
  return true;
}

/** Por qué una opción no está disponible (para explicarlo en vez de ocultarla sin más). */
export function unavailableReason(entry: CatalogEntry, ctx: AvailabilityContext): string | null {
  for (const requirement of entry.requires ?? []) {
    if (requirement === "bunting" && !ctx.rules.buntingAllowed) return "El toque no está permitido en esta modalidad";
    if (requirement === "stealing" && !ctx.rules.stealingAllowed) return "El robo no está permitido en esta modalidad";
    if (requirement === "dropped_third_strike" && !ctx.rules.droppedThirdStrike) return "Sin tercer strike no retenido en esta modalidad";
    if (requirement === "runners_on" && ctx.runnersOn.length === 0) return "Requiere corredores en base";
    if (requirement === "runner_on_third" && !ctx.runnersOn.includes(3)) return "Requiere corredor en tercera";
    if (requirement === "fewer_than_two_outs" && ctx.outs >= 2) return "Solo con menos de dos outs";
  }
  if (entry.key === "out.strikeout.foul" && ctx.rules.foulOnThirdStrike !== "out") return "En esta modalidad el foul con dos strikes no es out";
  return null;
}

export interface MenuGroup {
  def: CatalogGroupDef;
  entries: { entry: CatalogEntry; available: boolean; reason: string | null }[];
}

function buildMenu(
  catalog: readonly CatalogEntry[],
  groups: readonly CatalogGroupDef[],
  ctx: AvailabilityContext,
): MenuGroup[] {
  return groups
    .map((def) => ({
      def,
      entries: catalog
        .filter((entry) => entry.group === def.group)
        .map((entry) => ({
          entry,
          available: isAvailable(entry, ctx),
          reason: unavailableReason(entry, ctx),
        })),
    }))
    .filter((group) => group.entries.length > 0);
}

export function outMenu(ctx: AvailabilityContext): MenuGroup[] {
  return buildMenu(OUT_CATALOG, OUT_GROUPS, ctx);
}

export function reachMenu(ctx: AvailabilityContext): MenuGroup[] {
  return buildMenu(REACH_CATALOG, REACH_GROUPS, ctx);
}

export function findEntry(key: string): CatalogEntry | null {
  return OUT_CATALOG.find((e) => e.key === key) ?? REACH_CATALOG.find((e) => e.key === key) ?? null;
}

/** Entrada sintética para una secuencia libre escrita por el anotador. */
export function customOutEntry(kind: "ground" | "fly" | "line" | "popup" | "foul_fly", fielders: number[]): CatalogEntry {
  const last = fielders[fielders.length - 1];
  const prefix = kind === "fly" ? "F" : kind === "line" ? "L" : kind === "popup" ? "P" : kind === "foul_fly" ? "FF" : "";
  return {
    key: `out.custom.${kind}.${fielders.join("-")}`,
    group: "ground_out",
    label: `Out ${prefix}${prefix && last !== undefined ? last : fielders.join("-")}`,
    code: prefix && last !== undefined ? `${prefix}${last}` : fielders.join("-"),
    result: "out",
    kind,
    fielders,
    sequence: "fixed",
    runners: "hold",
    rbiEligible: kind !== "popup",
  };
}

/** Opciones de resolución para un corredor en una base. */
export interface RunnerOption {
  action: "stay" | "advance" | "score" | "out";
  to?: BaseIndex;
  label: string;
  shortcut?: string;
}

export function runnerOptions(from: OccupiedBase): RunnerOption[] {
  const options: RunnerOption[] = [
    { action: "stay", label: `Se queda en ${from}ª`, shortcut: "Q" },
  ];
  for (let to = from + 1; to <= 3; to += 1) {
    options.push({ action: "advance", to: to as BaseIndex, label: `Avanza a ${to}ª`, shortcut: String(to) });
  }
  options.push({ action: "score", to: 4, label: "Anota", shortcut: "A" });
  for (let to = from + 1; to <= 3; to += 1) {
    options.push({ action: "out", to: to as BaseIndex, label: `Out en ${to}ª` });
  }
  options.push({ action: "out", to: 4, label: "Out en home", shortcut: "X" });
  return options;
}
