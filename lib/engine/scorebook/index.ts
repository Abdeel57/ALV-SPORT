/**
 * Motor de libreta para deportes por entradas (softbol, béisbol).
 * Puro: sin React, sin I/O. Ver reduce.ts para el contrato de payload.
 */
export * from "./types";
export * from "./rules";
export * from "./positions";
export * from "./catalog";
export {
  reduceScorebook,
  nextBatter,
  onDeckBatter,
  currentPitcher,
  fielderAt,
  pathTargetLabel,
  AT_BAT_RESULTS,
  HIT_RESULTS,
  type ReduceInput,
  type ScorebookStateInternal,
  type TeamBookInternal,
} from "./reduce";
export * from "./stats";
export * from "./plays";
