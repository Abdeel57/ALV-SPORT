import { z } from "zod";

/** Forma de una crónica de partido (título, resumen, MVP, destacado). */

export const storySchema = z.object({
  titulo: z.string().min(4).max(160),
  resumen: z.string().min(50),
  mvp: z.object({
    nombre: z.string(),
    justificacion: z.string(),
  }),
  destacado: z.object({
    nombre: z.string(),
    razon: z.string(),
  }),
});

export type AiStory = z.infer<typeof storySchema>;
