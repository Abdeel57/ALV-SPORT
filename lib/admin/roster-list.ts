import { splitFullName } from "@/lib/utils";

/**
 * Parser del alta de roster por lista: una línea por jugador, con número de
 * playera opcional al inicio o al final ("23 Juan Pérez", "Juan Pérez #23",
 * "Juan Pérez, 23"). Puro y sin dependencias para poder probarlo aislado.
 */

export interface RosterListEntry {
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
}

export interface RosterListResult {
  entries: RosterListEntry[];
  /** Mensajes es-MX listos para mostrar; si hay alguno, no se debe guardar. */
  errors: string[];
}

export const ROSTER_LIST_MAX = 40;

const LEADING_NUMBER = /^#?(\d{1,4})[\s.,·-]+/;
const TRAILING_NUMBER = /[\s.,·-]+#?(\d{1,4})$/;

export function parseRosterList(text: string): RosterListResult {
  const entries: RosterListEntry[] = [];
  const errors: string[] = [];
  const seen = new Map<string, number>();

  const lines = text.split(/\r?\n/);
  let lineNumber = 0;
  for (const raw of lines) {
    lineNumber += 1;
    let line = raw.trim();
    if (line === "") continue;

    let jerseyNumber: string | null = null;
    const leading = line.match(LEADING_NUMBER);
    const trailing = line.match(TRAILING_NUMBER);
    if (leading?.[1]) {
      jerseyNumber = leading[1];
      line = line.slice(leading[0].length);
    } else if (trailing?.[1]) {
      jerseyNumber = trailing[1];
      line = line.slice(0, line.length - trailing[0].length);
    }
    // La coma solo separa el número; dentro del nombre no aporta.
    const name = line.replace(/[,;]/g, " ").replace(/\s+/g, " ").trim();

    if (name === "") {
      errors.push(`Línea ${lineNumber}: falta el nombre`);
      continue;
    }
    const { firstName, lastName } = splitFullName(name);
    if (!firstName || !lastName) {
      errors.push(`Línea ${lineNumber}: escribe nombre y apellido (“${name}”)`);
      continue;
    }

    const key = `${firstName} ${lastName}`.toLocaleLowerCase("es-MX");
    const priorLine = seen.get(key);
    if (priorLine !== undefined) {
      errors.push(`Línea ${lineNumber}: “${name}” está repetido (ver línea ${priorLine})`);
      continue;
    }
    seen.set(key, lineNumber);
    entries.push({ firstName, lastName, jerseyNumber });
  }

  if (entries.length === 0 && errors.length === 0) {
    errors.push("La lista está vacía");
  }
  if (entries.length > ROSTER_LIST_MAX) {
    errors.push(`Máximo ${ROSTER_LIST_MAX} jugadores por lista (hay ${entries.length})`);
  }
  return { entries, errors };
}
