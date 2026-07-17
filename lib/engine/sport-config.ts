import { z } from "zod";

/**
 * Schema del `config jsonb` de la tabla `sports`.
 * Cada deporte es configuración, no código: agregar un deporte nuevo es
 * insertar una fila que cumpla este schema. El motor no conoce deportes.
 */

/** Tipo de evento reservado por el motor; nunca aparece en configs. */
export const CORRECTION_EVENT_TYPE = "correction";

export const playerStatIncrementSchema = z.object({
  /** Debe existir en playerStatDefs. */
  key: z.string().min(1),
  /** Cuánto suma este evento a la estadística (fg3 → { key: "PTS", increment: 3 }). */
  increment: z.number().int().default(1),
});

export const eventTypeDefSchema = z.object({
  /** Coincide con game_events.event_type. */
  key: z.string().min(1),
  /** Etiqueta es-MX para UI y mesa de anotación. */
  label: z.string().min(1),
  /** Puntos que este evento acredita al team_id del evento. */
  scoreDelta: z.number().int().default(0),
  playerStats: z.array(playerStatIncrementSchema).default([]),
  requiresPlayer: z.boolean().default(false),
});

export const periodStructureSchema = z.object({
  type: z.enum(["innings", "quarters", "halves", "sets", "periods"]),
  /** Periodos reglamentarios. */
  count: z.number().int().positive(),
  /** Etiqueta es-MX del periodo: "Entrada", "Cuarto", "Set". */
  label: z.string().min(1),
  allowsTies: z.boolean(),
  overtime: z.object({
    enabled: z.boolean(),
    /** null = ilimitado (extra innings). */
    maxExtra: z.number().int().positive().nullable(),
  }),
});

export const tiebreakerSchema = z.enum([
  "head_to_head",
  "score_diff",
  "score_for",
  "score_against",
  "wins",
]);

export const standingsConfigSchema = z.object({
  rankBy: z.enum(["points", "win_pct"]),
  pointsFor: z.object({
    win: z.number(),
    tie: z.number(),
    loss: z.number(),
  }),
  /** Se aplican en orden dentro de grupos empatados por rankBy. */
  tiebreakers: z.array(tiebreakerSchema),
  /**
   * Cómo se decide el ganador de un partido: por marcador total (softbol,
   * basquetbol) o por periodos/sets ganados (voleibol, tenis). Config, no
   * código: el motor no conoce deportes.
   */
  winnerBy: z.enum(["total_score", "periods_won"]).default("total_score"),
});

export const playerStatDefSchema = z.object({
  key: z.string().min(1),
  /** Etiqueta es-MX. */
  label: z.string().min(1),
});

export const sportConfigSchema = z
  .object({
    version: z.literal(1),
    eventTypes: z.array(eventTypeDefSchema).min(1),
    periodStructure: periodStructureSchema,
    standings: standingsConfigSchema,
    playerStatDefs: z.array(playerStatDefSchema),
  })
  .superRefine((config, ctx) => {
    const eventKeys = new Set<string>();
    for (const eventType of config.eventTypes) {
      if (eventType.key === CORRECTION_EVENT_TYPE) {
        ctx.addIssue({
          code: "custom",
          message: `"${CORRECTION_EVENT_TYPE}" es un tipo de evento reservado por el motor`,
        });
      }
      if (eventKeys.has(eventType.key)) {
        ctx.addIssue({
          code: "custom",
          message: `Tipo de evento duplicado: "${eventType.key}"`,
        });
      }
      eventKeys.add(eventType.key);
    }
    const statKeys = new Set(config.playerStatDefs.map((def) => def.key));
    for (const eventType of config.eventTypes) {
      for (const stat of eventType.playerStats) {
        if (!statKeys.has(stat.key)) {
          ctx.addIssue({
            code: "custom",
            message: `El evento "${eventType.key}" incrementa la estadística "${stat.key}" que no existe en playerStatDefs`,
          });
        }
      }
    }
  });

export type SportConfig = z.infer<typeof sportConfigSchema>;
export type EventTypeDef = z.infer<typeof eventTypeDefSchema>;
export type PeriodStructure = z.infer<typeof periodStructureSchema>;
export type StandingsConfig = z.infer<typeof standingsConfigSchema>;
export type Tiebreaker = z.infer<typeof tiebreakerSchema>;
export type PlayerStatDef = z.infer<typeof playerStatDefSchema>;
