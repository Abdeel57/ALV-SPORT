import type { SportConfig } from "./sport-config";

export interface PayloadValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Valida el `payload` de un evento contra los `payloadFields` declarados en
 * la config del deporte. La fuente de verdad (`game_events`) no debe recibir
 * basura: un evento de tipo desconocido o con campos del tipo equivocado se
 * rechaza. Deportes sin campos declarados aceptan cualquier payload (no
 * rompe lo existente).
 *
 * Motor puro: se usa antes de encolar/insertar un evento, y es testeable
 * sin base de datos.
 */
export function validateEventPayload(
  eventType: string,
  payload: Record<string, unknown> | null | undefined,
  config: SportConfig,
): PayloadValidation {
  const def = config.eventTypes.find((event) => event.key === eventType);
  if (!def) {
    return { ok: false, errors: [`Tipo de evento desconocido: "${eventType}"`] };
  }
  const data = payload ?? {};
  const errors: string[] = [];
  for (const field of def.payloadFields) {
    const value = data[field.key];
    if (value === undefined || value === null) {
      if (field.required) errors.push(`Falta el campo requerido "${field.key}"`);
      continue;
    }
    if (typeof value !== field.type) {
      errors.push(`"${field.key}" debe ser ${field.type}, es ${typeof value}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
