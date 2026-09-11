import { z } from "zod";

/**
 * Perfil de reglas de un deporte por entradas (softbol/béisbol).
 *
 * Se guarda en `leagues.rules` y se copia a `games.rules_snapshot` al
 * iniciar cada partido: cambiar la liga después NO reinterpreta partidos
 * anteriores. Todo lo que aquí es opcional cae a los valores de slowpitch
 * descritos en las notas del cliente.
 */

export const rulesProfileSchema = z.object({
  version: z.literal(1).default(1),
  /** Nombre visible del perfil ("Slowpitch femenil ALV"). */
  name: z.string().min(1).default("Slowpitch"),

  /** Entradas programadas del partido. */
  innings: z.number().int().min(1).max(15).default(7),
  /**
   * Base de entradas para la efectividad (ERA = ER × base / entradas
   * lanzadas). Es un campo DISTINTO de `innings`: que un partido termine
   * antes no cambia la base estadística.
   */
  eraInningsBase: z.number().int().min(1).max(15).default(7),

  /** Cuenta con la que arranca cada bateador. Hay ligas que inician 1-1. */
  initialBalls: z.number().int().min(0).max(3).default(0),
  initialStrikes: z.number().int().min(0).max(2).default(0),
  ballsForWalk: z.number().int().min(1).max(4).default(4),
  strikesForOut: z.number().int().min(1).max(3).default(3),
  /** Foul con dos strikes: en slowpitch suele ser out. */
  foulOnThirdStrike: z.enum(["out", "none"]).default("out"),

  /** Bateadores en el orden (con EP). Slowpitch permite hasta 12. */
  maxBatters: z.number().int().min(9).max(15).default(12),
  minBatters: z.number().int().min(1).max(12).default(9),
  /** Defensivos en el campo: 10 con short fielder (SF), 9 sin él. */
  fielders: z.number().int().min(9).max(10).default(10),

  stealingAllowed: z.boolean().default(false),
  buntingAllowed: z.boolean().default(false),
  /** Tercer strike no retenido (solo béisbol / fastpitch). */
  droppedThirdStrike: z.boolean().default(false),
  courtesyRunnersAllowed: z.boolean().default(true),
  /** Un titular sustituido puede reingresar una vez. */
  reentryAllowed: z.boolean().default(true),

  /** Tope de carreras por entrada (null = sin tope). */
  runLimitPerInning: z.number().int().positive().nullable().default(null),
  /**
   * Regla de misericordia: diferencia de carreras a partir de cierta
   * entrada completa. null = sin regla.
   */
  mercyRule: z
    .object({
      runDifference: z.number().int().positive(),
      afterInning: z.number().int().positive(),
    })
    .nullable()
    .default(null),
  /** Límite de tiempo en minutos (null = sin límite). Informativo. */
  timeLimitMinutes: z.number().int().positive().nullable().default(null),
  /** Entradas extra si hay empate al terminar las programadas. */
  extraInnings: z.boolean().default(true),
  /**
   * Desempate internacional: corredor en segunda al iniciar cada entrada
   * extra. Solo informativo para el anotador (él coloca al corredor).
   */
  tiebreakRunnerOnSecond: z.boolean().default(false),
});

export type RulesProfile = z.infer<typeof rulesProfileSchema>;

/** Perfil de slowpitch con los supuestos documentados en MESA-PROGRESO.md. */
export const SLOWPITCH_RULES: RulesProfile = rulesProfileSchema.parse({
  name: "Slowpitch",
});

/** Perfil de béisbol/fastpitch tradicional, para ligas que lo usen. */
export const BASEBALL_RULES: RulesProfile = rulesProfileSchema.parse({
  name: "Béisbol",
  innings: 9,
  eraInningsBase: 9,
  foulOnThirdStrike: "none",
  maxBatters: 10,
  fielders: 9,
  stealingAllowed: true,
  buntingAllowed: true,
  droppedThirdStrike: true,
  courtesyRunnersAllowed: false,
  reentryAllowed: false,
});

/**
 * Lee un perfil guardado (jsonb) tolerando nulos y valores parciales: lo
 * que falte cae a los defaults de slowpitch. Un jsonb corrupto no tumba la
 * mesa: se usa el perfil por omisión y se reporta.
 */
export function parseRulesProfile(
  raw: unknown,
): { rules: RulesProfile; error: string | null } {
  if (raw === null || raw === undefined) {
    return { rules: SLOWPITCH_RULES, error: null };
  }
  const result = rulesProfileSchema.safeParse(raw);
  if (result.success) return { rules: result.data, error: null };
  return {
    rules: SLOWPITCH_RULES,
    error: result.error.issues[0]?.message ?? "Perfil de reglas inválido",
  };
}
