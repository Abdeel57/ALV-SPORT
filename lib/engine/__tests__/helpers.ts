import { eventsByGameId, type SeedGameEvent } from "@/lib/seed-data/games-events";
import { gameId } from "@/lib/seed-data/ids";

export function eventsForGame(gameIndex: number): SeedGameEvent[] {
  const events = eventsByGameId.get(gameId(gameIndex));
  if (!events) throw new Error(`El seed no tiene eventos para el juego ${gameIndex}`);
  return events;
}
