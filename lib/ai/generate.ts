import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildPrompt, type GameAiContext, type GameAiInput } from "./context";

/**
 * Llamada a la API de Anthropic. La API key vive SOLO en el servidor
 * (ANTHROPIC_API_KEY) y este módulo es server-only: nunca llega al cliente.
 * Salida estructurada vía output_config.format → JSON garantizado.
 */

export function hasAnthropicEnv(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

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

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titulo", "resumen", "mvp", "destacado"],
  properties: {
    titulo: { type: "string", description: "Título de la noticia, es-MX, sin comillas" },
    resumen: {
      type: "string",
      description: "Crónica de 2-3 párrafos en es-MX separados por líneas en blanco",
    },
    mvp: {
      type: "object",
      additionalProperties: false,
      required: ["nombre", "justificacion"],
      properties: {
        nombre: { type: "string" },
        justificacion: {
          type: "string",
          description: "Justificación estadística con números exactos del partido",
        },
      },
    },
    destacado: {
      type: "object",
      additionalProperties: false,
      required: ["nombre", "razon"],
      properties: {
        nombre: { type: "string" },
        razon: { type: "string" },
      },
    },
  },
} as const;

const SYSTEM_PROMPT =
  "Eres cronista de deportes de una liga amateur mexicana. Escribes en español de México, con precisión: solo afirmas lo que los datos respaldan. Nombres de jugadores y números exactos como vienen en los datos.";

export async function generateGameStory(
  input: GameAiInput,
  context: GameAiContext,
): Promise<AiStory> {
  const client = new Anthropic();

  const response = await client.messages.create({
    // Modelo fijado por decisión del proyecto para esta fase.
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: {
      format: {
        type: "json_schema",
        schema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
      },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPrompt(input, context) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("El modelo declinó generar la crónica");
  }
  const text = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  )?.text;
  if (!text) throw new Error("La respuesta del modelo no trajo contenido");
  return storySchema.parse(JSON.parse(text));
}
