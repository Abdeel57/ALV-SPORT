/**
 * Intérprete de tablas de estadísticas exportadas por otro programa, en
 * texto plano o HTML. Formato típico (bateo):
 *
 *   BLACK TEAM - Batting
 *   Name              AB  R  H RBI 2B 3B HR BB SO SB   BA  SLG  OBP
 *   Apellido, Nombre  20  8 13  10  4  0  0  0  1  0 .650 .850 .691
 *   …
 *   Totals           289 125 136 108 18 6 7 52 30 0 .471 .647 .545
 *   Number of players : 20
 *
 * Es puro (sin I/O) y tolerante: el encabezado se detecta por sus códigos
 * de columna, el nombre puede llevar espacios y comas, y las filas que no
 * cuadran se reportan como avisos en vez de tumbar la carga.
 */

export class StatsImportError extends Error {}

export type StatsKind = "batting" | "pitching" | "fielding" | "other";
export type StatValue = number | string | null;
export type StatsFormat = "text" | "html";

export interface ParsedStatRow {
  name: string;
  values: Record<string, StatValue>;
}

export interface ParsedStatsDocument {
  title: string;
  kind: StatsKind;
  format: StatsFormat;
  columns: string[];
  rows: ParsedStatRow[];
  totals: Record<string, StatValue> | null;
  playerCount: number | null;
  warnings: string[];
}

const KNOWN_COLUMNS = new Set([
  "AB", "R", "H", "RBI", "2B", "3B", "HR", "BB", "SO", "K", "SB", "CS", "HBP", "SF", "SH", "AVG", "BA",
  "SLG", "OBP", "OPS", "TB", "PA", "G", "GP", "GS", "E", "PO", "A", "DP", "FPCT", "FLD%", "W", "L",
  "SV", "IP", "ER", "ERA", "WHIP", "BF", "HB", "WP", "BK", "CG", "SHO", "HLD", "BS", "RA", "XBH",
  "GDP", "LOB", "IBB", "BABIP", "ISO", "PCT", "%", "TC", "H/9", "BB/9", "K/9", "SO/9", "HR/9",
  "CI", "VB", "C", "HI", "CI", "BR", "CE", "PCL", "PROM",
]);

export const KIND_LABELS: Record<StatsKind, string> = {
  batting: "Bateo",
  pitching: "Pitcheo",
  fielding: "Defensa",
  other: "Estadísticas",
};

function isKnownColumn(token: string): boolean {
  return KNOWN_COLUMNS.has(token.trim().toUpperCase());
}

/** Un encabezado tiene al menos tres códigos conocidos y son mayoría. */
function isHeaderRow(cells: readonly string[]): boolean {
  const filled = cells.filter((cell) => cell.trim() !== "");
  const known = filled.filter(isKnownColumn).length;
  return known >= 3 && known * 2 >= filled.length;
}

export function parseStatValue(raw: string): StatValue {
  const text = raw.trim().replace(/,/g, "");
  if (text === "" || text === "-" || text === "—" || text === "--" || text === "–") return null;
  if (/^-?\d*\.\d+$/.test(text) || /^-?\d+$/.test(text)) return Number(text);
  const percent = /^(-?\d*\.?\d+)%$/.exec(text);
  if (percent) return Number(percent[1]);
  return text;
}

function looksNumeric(raw: string): boolean {
  const value = parseStatValue(raw);
  return value === null || typeof value === "number";
}

function detectKind(title: string | null, columns: readonly string[]): StatsKind {
  const text = (title ?? "").toLowerCase();
  if (/bat(t)?ing|bateo|ofensiv/.test(text)) return "batting";
  if (/pitch|lanz|pitcheo/.test(text)) return "pitching";
  if (/field|defens|fildeo/.test(text)) return "fielding";
  const set = new Set(columns.map((c) => c.toUpperCase()));
  if (set.has("ERA") || set.has("IP") || set.has("WHIP")) return "pitching";
  if (set.has("PO") && set.has("A") && set.has("E")) return "fielding";
  if (set.has("AB") || set.has("AVG") || set.has("BA")) return "batting";
  return "other";
}

function uniqueColumns(header: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return header.map((raw) => {
    const name = raw.trim();
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}·${count + 1}`;
  });
}

function build(
  format: StatsFormat,
  title: string | null,
  header: readonly string[],
  body: readonly (readonly string[])[],
  playerCount: number | null,
  warnings: string[],
): ParsedStatsDocument {
  const columns = uniqueColumns(header.filter((cell) => cell.trim() !== ""));
  if (columns.length < 3) {
    throw new StatsImportError("El encabezado necesita al menos tres columnas de estadísticas (AB, R, H…).");
  }
  const rows: ParsedStatRow[] = [];
  let totals: Record<string, StatValue> | null = null;
  for (const cells of body) {
    const [rawName, ...valueCells] = cells;
    const name = (rawName ?? "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    if (valueCells.every((cell) => cell.trim() === "")) continue;
    const values: Record<string, StatValue> = {};
    columns.forEach((column, index) => {
      values[column] = parseStatValue(valueCells[index] ?? "");
    });
    if (/^total(es|s)?$/i.test(name)) {
      totals = values;
      continue;
    }
    rows.push({ name, values });
  }
  if (rows.length === 0) {
    throw new StatsImportError("No encontré filas de jugadores debajo del encabezado.");
  }
  const kind = detectKind(title, columns);
  return {
    title: title?.trim() || KIND_LABELS[kind],
    kind,
    format,
    columns,
    rows,
    totals,
    playerCount,
    warnings,
  };
}

const PLAYER_COUNT = /^(?:number of players|n[úu]mero de jugador(?:es|as)|jugador(?:es|as))\s*[:=]?\s*(\d+)\s*$/i;

/* ------------------------------- Texto -------------------------------- */

function parseText(input: string): ParsedStatsDocument {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, "  ").trimEnd())
    .filter((line) => line.trim() !== "");
  const headerIndex = lines.findIndex((line) => isHeaderRow(line.trim().split(/\s+/)));
  if (headerIndex === -1) {
    throw new StatsImportError("No encontré el encabezado con las columnas (AB, R, H, RBI…). Revisa que el documento sea la tabla de estadísticas.");
  }
  const title = lines.slice(0, headerIndex).find((line) => /\p{L}/u.test(line)) ?? null;

  const headerTokens = lines[headerIndex]!.trim().split(/\s+/);
  while (headerTokens.length > 0 && !isKnownColumn(headerTokens[0]!)) headerTokens.shift();
  const columns = headerTokens;

  const body: string[][] = [];
  const warnings: string[] = [];
  let playerCount: number | null = null;
  for (const line of lines.slice(headerIndex + 1)) {
    const trimmed = line.trim();
    const count = PLAYER_COUNT.exec(trimmed);
    if (count) {
      playerCount = Number(count[1]);
      continue;
    }
    const tokens = trimmed.split(/\s+/);
    if (tokens.length < columns.length + 1) {
      warnings.push(`Línea ignorada (faltan columnas): "${trimmed.slice(0, 60)}"`);
      continue;
    }
    const values = tokens.slice(-columns.length);
    const numeric = values.filter(looksNumeric).length;
    if (numeric * 2 < values.length) {
      warnings.push(`Línea ignorada (no parece una fila de estadísticas): "${trimmed.slice(0, 60)}"`);
      continue;
    }
    const name = tokens.slice(0, tokens.length - columns.length).join(" ");
    body.push([name, ...values]);
  }
  return build("text", title, columns, body, playerCount, warnings);
}

/* -------------------------------- HTML -------------------------------- */

const NAMED_ENTITIES: Record<string, string> = {
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", Uuml: "Ü",
  iquest: "¿", iexcl: "¡", ordf: "ª", ordm: "º", deg: "°", ndash: "–", mdash: "—", hellip: "…",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&([A-Za-z]+);/g, (match, name: string) => NAMED_ENTITIES[name] ?? match)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function tableRows(table: string): string[][] {
  return [...table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((row) =>
    [...row[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripTags(cell[1] ?? "")),
  );
}

function htmlTitle(input: string, firstTable: number): string | null {
  const heading = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(input);
  if (heading) return stripTags(heading[1] ?? "") || null;
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(input);
  if (title) {
    const text = stripTags(title[1] ?? "");
    if (text) return text;
  }
  const before = firstTable > 0 ? input.slice(0, firstTable) : "";
  const bodyText = stripTags(before.replace(/<head\b[\s\S]*?<\/head>/i, ""));
  return bodyText || null;
}

function parseHtml(input: string): ParsedStatsDocument {
  const tables = [...input.matchAll(/<table\b[\s\S]*?<\/table>/gi)];
  for (const match of tables) {
    const rows = tableRows(match[0]);
    const headerIndex = rows.findIndex(isHeaderRow);
    if (headerIndex === -1) continue;
    const header = rows[headerIndex]!;
    const firstKnown = header.findIndex(isKnownColumn);
    const columns = header.slice(firstKnown);
    const warnings: string[] = [];
    let playerCount: number | null = null;
    const body: string[][] = [];
    for (const row of rows.slice(headerIndex + 1)) {
      const flat = row.join(" ").trim();
      const count = PLAYER_COUNT.exec(flat);
      if (count) {
        playerCount = Number(count[1]);
        continue;
      }
      if (row.every((cell) => cell === "")) continue;
      if (row.length < firstKnown + 1) {
        warnings.push(`Fila ignorada: "${flat.slice(0, 60)}"`);
        continue;
      }
      const name = row.slice(0, Math.max(firstKnown, 1)).join(" ").trim();
      const values = row.slice(Math.max(firstKnown, 1), Math.max(firstKnown, 1) + columns.length);
      body.push([name, ...values]);
    }
    // Un pie como "Number of players: 20" puede venir fuera de la tabla.
    if (playerCount === null) {
      const tail = stripTags(input.slice((match.index ?? 0) + match[0].length));
      const count = /(?:number of players|n[úu]mero de jugador(?:es|as))\s*[:=]?\s*(\d+)/i.exec(tail);
      if (count) playerCount = Number(count[1]);
    }
    return build("html", htmlTitle(input, match.index ?? 0), columns, body, playerCount, warnings);
  }
  // Sin tabla utilizable: se lee como texto conservando los saltos de línea.
  const asText = decodeEntities(
    input
      .replace(/<head\b[\s\S]*?<\/head>/i, "")
      .replace(/<(br|\/tr|\/p|\/div|\/h[1-6]|\/li)\b[^>]*>/gi, "\n")
      .replace(/<\/t[dh]\b[^>]*>/gi, "  ")
      .replace(/<[^>]+>/g, " "),
  );
  const parsed = parseText(asText);
  return { ...parsed, format: "html" };
}

/* ------------------------------ Entrada ------------------------------- */

export function isHtmlDocument(input: string, filename?: string): boolean {
  if (filename && /\.html?$/i.test(filename)) return true;
  return /<\s*(html|table|tr|td|th|body|div|p)\b/i.test(input);
}

export function parseStatsDocument(input: string, options: { filename?: string } = {}): ParsedStatsDocument {
  const text = input.replace(/^﻿/, "");
  if (text.trim() === "") throw new StatsImportError("El documento está vacío.");
  return isHtmlDocument(text, options.filename) ? parseHtml(text) : parseText(text);
}
