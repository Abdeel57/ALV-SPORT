/**
 * Posiciones defensivas y roles de alineación.
 *
 * Una POSICIÓN es dónde defiende alguien (P, C, 1B…). Un ROL describe por
 * qué está en el orden al bate sin defender (EP, DH) o cómo entró (PH, PR).
 * No son intercambiables: un DH nunca se anota como si jugara primera base.
 */

export const POSITIONS = [
  { code: "P", number: 1, label: "Pitcher" },
  { code: "C", number: 2, label: "Receptor" },
  { code: "1B", number: 3, label: "Primera base" },
  { code: "2B", number: 4, label: "Segunda base" },
  { code: "3B", number: 5, label: "Tercera base" },
  { code: "SS", number: 6, label: "Shortstop" },
  { code: "LF", number: 7, label: "Jardinero izquierdo" },
  { code: "CF", number: 8, label: "Jardinero central" },
  { code: "RF", number: 9, label: "Jardinero derecho" },
  /**
   * Short fielder: cuarto jardinero del slowpitch, posición 10. Distinto
   * del código estadístico SF (elevado de sacrificio), que vive en las
   * estadísticas de bateo, no aquí.
   */
  { code: "SF", number: 10, label: "Short fielder" },
] as const;

export type PositionCode = (typeof POSITIONS)[number]["code"];

/** Roles de alineación que NO son posiciones defensivas. */
export const LINEUP_ROLES = [
  { code: "EP", label: "Jugador extra (batea, no defiende)" },
  { code: "DH", label: "Bateador designado" },
  { code: "PH", label: "Bateador emergente" },
  { code: "PR", label: "Corredor emergente" },
  { code: "FLEX", label: "Solo defiende (no batea)" },
] as const;

export type LineupRoleCode = (typeof LINEUP_ROLES)[number]["code"];

type Position = (typeof POSITIONS)[number];
const BY_CODE = new Map<string, Position>(POSITIONS.map((position) => [position.code, position]));
const BY_NUMBER = new Map<number, Position>(POSITIONS.map((position) => [position.number, position]));

export function isPositionCode(value: string): value is PositionCode {
  return BY_CODE.has(value as PositionCode);
}

export function positionByCode(code: string) {
  return BY_CODE.get(code as PositionCode) ?? null;
}

export function positionByNumber(number: number) {
  return BY_NUMBER.get(number) ?? null;
}

export function positionLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return positionByCode(code)?.label ?? code;
}

/** "6-4-3" a partir de [6, 4, 3]; las posiciones desconocidas se muestran tal cual. */
export function fielderSequenceCode(fielders: readonly number[]): string {
  return fielders.map((n) => String(n)).join("-");
}

/** Posiciones válidas según cuántos defensivos permite el perfil. */
export function positionsFor(fielders: number): readonly (typeof POSITIONS)[number][] {
  return POSITIONS.filter((position) => position.number <= fielders);
}
