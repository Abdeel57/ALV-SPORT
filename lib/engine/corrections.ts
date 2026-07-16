import { CORRECTION_EVENT_TYPE } from "./sport-config";
import type { EngineGameEvent } from "./types";

/**
 * Un evento queda anulado si existe una corrección vigente que lo referencia.
 * Una corrección puede a su vez ser anulada por otra corrección (deshacer un
 * deshacer), en cuyo caso el evento original vuelve a contar. Los ciclos son
 * imposibles: game_events es append-only y corrects_event_id apunta siempre
 * a un evento anterior.
 */
export function buildExclusionSet(
  events: readonly EngineGameEvent[],
): Set<string> {
  const correctorsByTarget = new Map<string, EngineGameEvent[]>();
  for (const event of events) {
    if (event.eventType === CORRECTION_EVENT_TYPE && event.correctsEventId) {
      const correctors = correctorsByTarget.get(event.correctsEventId) ?? [];
      correctors.push(event);
      correctorsByTarget.set(event.correctsEventId, correctors);
    }
  }

  const voidedMemo = new Map<string, boolean>();
  const isVoided = (eventId: string): boolean => {
    const memoized = voidedMemo.get(eventId);
    if (memoized !== undefined) return memoized;
    const correctors = correctorsByTarget.get(eventId) ?? [];
    const voided = correctors.some((corrector) => !isVoided(corrector.id));
    voidedMemo.set(eventId, voided);
    return voided;
  };

  const excluded = new Set<string>();
  for (const event of events) {
    if (event.eventType !== CORRECTION_EVENT_TYPE && isVoided(event.id)) {
      excluded.add(event.id);
    }
  }
  return excluded;
}

/**
 * Eventos que cuentan: sin correcciones y sin eventos anulados por ellas.
 * Todo cálculo del motor (marcador, standings, stats) parte de aquí.
 */
export function effectiveEvents(
  events: readonly EngineGameEvent[],
): EngineGameEvent[] {
  const excluded = buildExclusionSet(events);
  return events.filter(
    (event) =>
      event.eventType !== CORRECTION_EVENT_TYPE && !excluded.has(event.id),
  );
}
