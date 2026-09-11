/**
 * Opciones de equipo agrupadas por categoría (liga) para los <select> del
 * panel: con varias categorías, la lista plana de equipos se vuelve
 * inmanejable.
 */
export interface TeamChoice {
  id: string;
  name: string;
  category: string;
}

export function TeamOptions({ teams }: { teams: TeamChoice[] }) {
  const groups = new Map<string, TeamChoice[]>();
  for (const team of teams) {
    const list = groups.get(team.category) ?? [];
    list.push(team);
    groups.set(team.category, list);
  }
  if (groups.size <= 1) {
    return (
      <>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </>
    );
  }
  return (
    <>
      {[...groups.entries()].map(([category, list]) => (
        <optgroup key={category} label={category}>
          {list.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
