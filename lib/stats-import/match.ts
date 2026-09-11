/**
 * Vincula nombres del documento ("Apellido, Nombre" o "Nombre Apellido")
 * con jugadores de la plantilla, sin acentos ni mayúsculas. Un nombre
 * ambiguo (dos jugadores iguales) no se vincula: mejor sin enlace que un
 * enlace equivocado.
 */

export interface RosterName {
  playerId: string;
  firstName: string;
  lastName: string;
}

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9,\s]/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

const AMBIGUOUS = "";

export function matchPlayers(names: readonly string[], roster: readonly RosterName[]): (string | null)[] {
  const index = new Map<string, string>();
  const add = (key: string, playerId: string): void => {
    if (!key) return;
    const existing = index.get(key);
    if (existing !== undefined && existing !== playerId) index.set(key, AMBIGUOUS);
    else index.set(key, playerId);
  };
  for (const player of roster) {
    const first = normalizeName(player.firstName);
    const last = normalizeName(player.lastName);
    if (!first && !last) continue;
    add(`${last}, ${first}`, player.playerId);
    add(`${first} ${last}`, player.playerId);
    add(`${last} ${first}`, player.playerId);
    const firstToken = first.split(" ")[0] ?? "";
    const lastToken = last.split(" ")[0] ?? "";
    if (firstToken && lastToken) {
      add(`${lastToken}, ${firstToken}`, player.playerId);
      add(`${firstToken} ${lastToken}`, player.playerId);
    }
  }
  return names.map((name) => {
    const found = index.get(normalizeName(name));
    return found ? found : null;
  });
}
