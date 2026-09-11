import { z } from "zod";
import type { StatsKind, StatValue } from "./parse";

/**
 * Forma pública de una tabla importada (lo que ven la página del equipo y
 * el panel). Los jsonb de la base se validan al leerlos: un registro
 * corrupto no tumba la página, se omite.
 */

export interface TeamStatImportView {
  id: string;
  kind: StatsKind;
  title: string;
  sourceName: string | null;
  columns: string[];
  rows: { name: string; playerId: string | null; values: Record<string, StatValue> }[];
  totals: Record<string, StatValue> | null;
  playerCount: number | null;
  updatedAt: string;
}

const valueSchema = z.union([z.number(), z.string(), z.null()]);
const valuesSchema = z.record(z.string(), valueSchema);

export const statImportRowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["batting", "pitching", "fielding", "other"]),
  title: z.string(),
  source_name: z.string().nullable(),
  columns: z.array(z.string()),
  rows: z.array(
    z.object({
      name: z.string(),
      playerId: z.string().nullable(),
      values: valuesSchema,
    }),
  ),
  totals: valuesSchema.nullable(),
  player_count: z.number().int().nullable(),
  updated_at: z.string(),
});

export function toStatImportView(raw: unknown): TeamStatImportView | null {
  const parsed = statImportRowSchema.safeParse(raw);
  if (!parsed.success) return null;
  const row = parsed.data;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    sourceName: row.source_name,
    columns: row.columns,
    rows: row.rows,
    totals: row.totals,
    playerCount: row.player_count,
    updatedAt: row.updated_at,
  };
}

const THREE_DECIMALS = new Set(["AVG", "BA", "SLG", "OBP", "OPS", "FPCT", "FLD%", "PCT", "BABIP", "ISO", "PROM"]);
const TWO_DECIMALS = new Set(["ERA", "WHIP", "H/9", "BB/9", "K/9", "SO/9", "HR/9"]);

/** ".650" para promedios, "3.50" para efectividad, enteros tal cual. */
export function formatStatValue(column: string, value: StatValue): string {
  if (value === null) return "—";
  if (typeof value === "string") return value;
  const key = column.toUpperCase().replace(/·\d+$/, "");
  if (THREE_DECIMALS.has(key)) return value.toFixed(3).replace(/^(-?)0\./, "$1.");
  if (TWO_DECIMALS.has(key)) return value.toFixed(2);
  if (Number.isInteger(value)) return String(value);
  return String(value);
}
