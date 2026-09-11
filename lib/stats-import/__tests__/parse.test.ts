import { describe, expect, it } from "vitest";
import { StatsImportError, formatStatValue, matchPlayers, normalizeName, parseStatsDocument, toStatImportView } from "..";

/** Documento en texto con el formato del programa externo (nombres ficticios). */
const TEXT_DOC = `BLACK TEAM - Batting

Name                 AB   R   H  RBI  2B  3B  HR  BB  SO  SB    BA   SLG   OBP
Pérez, Ana           20   8  13   10   4   0   0   0   1   0  .650  .850  .691
Lopez Diaz, Maria    25  16  16   10   6   0   2   2   1   0  .640 1.120  .667
Ruiz, Sofia           2   3   0    1   0   0   0   2   1   0  .000  .000  .500
Totals              289 125 136  108  18   6   7  52  30   0  .471  .647  .545
Number of players : 20
`;

const HTML_DOC = `<html><head><title>Reporte</title></head><body>
<h1>BLACK TEAM - Batting</h1>
<table border="1">
<tr><th>Name</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>BA</th></tr>
<tr><td>P&eacute;rez, Ana</td><td>20</td><td>8</td><td>13</td><td>10</td><td>.650</td></tr>
<tr><td>Ruiz, Sofia</td><td>2</td><td>3</td><td>0</td><td>1</td><td>.000</td></tr>
<tr><td>Totals</td><td>22</td><td>11</td><td>13</td><td>11</td><td>.591</td></tr>
</table>
<p>Number of players : 2</p>
</body></html>`;

describe("parseStatsDocument (texto)", () => {
  it("lee título, columnas, filas, totales y número de jugadores", () => {
    const doc = parseStatsDocument(TEXT_DOC);
    expect(doc.format).toBe("text");
    expect(doc.kind).toBe("batting");
    expect(doc.title).toBe("BLACK TEAM - Batting");
    expect(doc.columns).toEqual(["AB", "R", "H", "RBI", "2B", "3B", "HR", "BB", "SO", "SB", "BA", "SLG", "OBP"]);
    expect(doc.rows).toHaveLength(3);
    expect(doc.rows[0]).toEqual({
      name: "Pérez, Ana",
      values: { AB: 20, R: 8, H: 13, RBI: 10, "2B": 4, "3B": 0, HR: 0, BB: 0, SO: 1, SB: 0, BA: 0.65, SLG: 0.85, OBP: 0.691 },
    });
    // Nombres con varios espacios se conservan completos.
    expect(doc.rows[1]?.name).toBe("Lopez Diaz, Maria");
    expect(doc.rows[1]?.values.SLG).toBe(1.12);
    expect(doc.totals?.AB).toBe(289);
    expect(doc.totals?.OBP).toBe(0.545);
    expect(doc.playerCount).toBe(20);
    expect(doc.warnings).toEqual([]);
  });

  it("ignora líneas que no son filas y lo reporta como aviso", () => {
    const doc = parseStatsDocument(`${TEXT_DOC}\nGenerado por el programa X el lunes\n`);
    expect(doc.rows).toHaveLength(3);
    expect(doc.warnings).toHaveLength(1);
  });

  it("acepta tabuladores y encabezados sin columna de nombre", () => {
    const doc = parseStatsDocument("Pitching\nIP\tH\tER\tBB\tSO\tERA\nGomez, Luis\t6.1\t5\t3\t2\t4\t3.32\n");
    expect(doc.kind).toBe("pitching");
    expect(doc.columns).toEqual(["IP", "H", "ER", "BB", "SO", "ERA"]);
    expect(doc.rows[0]?.values.ERA).toBe(3.32);
    expect(doc.rows[0]?.values.IP).toBe(6.1);
  });

  it("rechaza documentos sin encabezado o vacíos", () => {
    expect(() => parseStatsDocument("hola\nmundo")).toThrow(StatsImportError);
    expect(() => parseStatsDocument("   ")).toThrow(StatsImportError);
    expect(() => parseStatsDocument("Name AB R H\n")).toThrow(/filas de jugadores/);
  });
});

describe("parseStatsDocument (html)", () => {
  it("lee la tabla, decodifica entidades y toma el título del h1", () => {
    const doc = parseStatsDocument(HTML_DOC, { filename: "black.html" });
    expect(doc.format).toBe("html");
    expect(doc.title).toBe("BLACK TEAM - Batting");
    expect(doc.columns).toEqual(["AB", "R", "H", "RBI", "BA"]);
    expect(doc.rows.map((r) => r.name)).toEqual(["Pérez, Ana", "Ruiz, Sofia"]);
    expect(doc.rows[0]?.values.BA).toBe(0.65);
    expect(doc.totals?.H).toBe(13);
    expect(doc.playerCount).toBe(2);
  });

  it("detecta HTML aunque el archivo no tenga extensión", () => {
    expect(parseStatsDocument(HTML_DOC).format).toBe("html");
  });

  it("cae a texto cuando el HTML no trae tabla", () => {
    const doc = parseStatsDocument("<html><body><pre>Fielding<br>PO A E<br>Ruiz, Sofia 10 3 1</pre></body></html>");
    expect(doc.kind).toBe("fielding");
    expect(doc.rows[0]?.values).toEqual({ PO: 10, A: 3, E: 1 });
  });
});

describe("matchPlayers", () => {
  const roster = [
    { playerId: "p1", firstName: "Ana", lastName: "Pérez" },
    { playerId: "p2", firstName: "María Fernanda", lastName: "López Díaz" },
    { playerId: "p3", firstName: "Sofía", lastName: "Ruiz" },
    { playerId: "p4", firstName: "Sofía", lastName: "Ruiz" },
  ];

  it("vincula por apellido, nombre sin importar acentos ni orden", () => {
    expect(matchPlayers(["Perez, Ana", "Ana Pérez", "Lopez Diaz, Maria Fernanda", "Lopez, Maria"], roster)).toEqual(["p1", "p1", "p2", "p2"]);
  });

  it("no vincula nombres ambiguos ni desconocidos", () => {
    expect(matchPlayers(["Ruiz, Sofia", "Torres, Juan"], roster)).toEqual([null, null]);
  });

  it("normaliza puntuación y espacios", () => {
    expect(normalizeName("  PÉREZ ,  Ana  ")).toBe("perez, ana");
  });
});

describe("vista pública", () => {
  it("formatea promedios sin cero inicial y efectividad con dos decimales", () => {
    expect(formatStatValue("BA", 0.65)).toBe(".650");
    expect(formatStatValue("SLG", 1.12)).toBe("1.120");
    expect(formatStatValue("ERA", 3.5)).toBe("3.50");
    expect(formatStatValue("AB", 20)).toBe("20");
    expect(formatStatValue("AB", null)).toBe("—");
  });

  it("descarta registros corruptos en vez de fallar", () => {
    expect(toStatImportView({ id: "x" })).toBeNull();
    const view = toStatImportView({
      id: "5c6f9a3e-1c1c-4b4b-8b8b-2d2d2d2d2d2d",
      kind: "batting",
      title: "T",
      source_name: null,
      columns: ["AB"],
      rows: [{ name: "Pérez, Ana", playerId: null, values: { AB: 1 } }],
      totals: null,
      player_count: 1,
      updated_at: "2026-09-11T00:00:00.000Z",
    });
    expect(view?.rows[0]?.values.AB).toBe(1);
  });
});
