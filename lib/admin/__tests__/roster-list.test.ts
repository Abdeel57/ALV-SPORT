import { describe, expect, it } from "vitest";
import { parseRosterList, ROSTER_LIST_MAX } from "../roster-list";

describe("parseRosterList", () => {
  it("acepta nombre simple, número al inicio, al final, con # y con coma", () => {
    const { entries, errors } = parseRosterList(
      [
        "Juan Pérez",
        "23 María López",
        "Pedro Ramírez #7",
        "Ana Gutiérrez, 10",
        "#4 Luis Mendoza",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(entries).toEqual([
      { firstName: "Juan", lastName: "Pérez", jerseyNumber: null },
      { firstName: "María", lastName: "López", jerseyNumber: "23" },
      { firstName: "Pedro", lastName: "Ramírez", jerseyNumber: "7" },
      { firstName: "Ana", lastName: "Gutiérrez", jerseyNumber: "10" },
      { firstName: "Luis", lastName: "Mendoza", jerseyNumber: "4" },
    ]);
  });

  it("nombres largos: 4+ tokens reparten 2 al nombre (splitFullName)", () => {
    const { entries } = parseRosterList("María Fernanda Ruiz Castillo, 12");
    expect(entries[0]).toEqual({
      firstName: "María Fernanda",
      lastName: "Ruiz Castillo",
      jerseyNumber: "12",
    });
  });

  it("ignora líneas vacías y espacios extra", () => {
    const { entries, errors } = parseRosterList("\n  Juan Pérez  \n\n  8   Ana Solís \n");
    expect(errors).toEqual([]);
    expect(entries).toHaveLength(2);
  });

  it("rechaza línea sin apellido con el número de línea", () => {
    const { errors } = parseRosterList("Juan Pérez\nMadonna");
    expect(errors).toEqual(['Línea 2: escribe nombre y apellido (“Madonna”)']);
  });

  it("rechaza línea que solo trae número", () => {
    const { errors } = parseRosterList("23");
    expect(errors[0]).toContain("Línea 1");
  });

  it("rechaza nombres repetidos citando ambas líneas", () => {
    const { errors } = parseRosterList("Juan Pérez, 3\njuan pérez #5");
    expect(errors).toEqual(["Línea 2: “juan pérez” está repetido (ver línea 1)"]);
  });

  it("rechaza lista vacía y listas más largas que el máximo", () => {
    expect(parseRosterList("  \n ").errors).toEqual(["La lista está vacía"]);
    const long = Array.from({ length: ROSTER_LIST_MAX + 1 }, (_, i) => `Jugador Apellido${i}`);
    expect(parseRosterList(long.join("\n")).errors[0]).toContain(`Máximo ${ROSTER_LIST_MAX}`);
  });
});
