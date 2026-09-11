import { types } from "pg";

/**
 * Ajusta cómo `pg` convierte los tipos de Postgres a JavaScript para que el
 * resto de la app reciba EXACTAMENTE lo que recibía de PostgREST. Sin esto
 * la migración cambiaría datos de forma silenciosa:
 *
 *  - bigint llega como texto → `seq` se ordenaría alfabéticamente ("10" < "9").
 *  - numeric llega como texto → `points` y `amount` romperían sumas y formato.
 *  - timestamptz llega como Date → el tipo declarado es string ISO.
 *  - date llega como Date en medianoche LOCAL → un día menos según la zona.
 */

const INT8 = 20;
const NUMERIC = 1700;
const TIMESTAMP = 1114;
const TIMESTAMPTZ = 1184;
const DATE = 1082;

let applied = false;

export function applyTypeParsers(): void {
  if (applied) return;
  applied = true;

  // Contadores de identidad (game_events.seq, audit_log.id): caben de sobra
  // en un number y el motor los ordena numéricamente.
  types.setTypeParser(INT8, (value: string) => Number(value));

  // points (numeric) y amount (numeric(10,2)): magnitudes pequeñas, sin
  // riesgo de pérdida de precisión.
  types.setTypeParser(NUMERIC, (value: string) => Number(value));

  // ISO con Z, como devolvía PostgREST.
  types.setTypeParser(TIMESTAMPTZ, (value: string) => new Date(value).toISOString());
  types.setTypeParser(TIMESTAMP, (value: string) =>
    new Date(`${value.replace(" ", "T")}Z`).toISOString(),
  );

  // Fecha sin hora: se queda tal cual ("2026-07-18"), nunca como Date.
  types.setTypeParser(DATE, (value: string) => value);
}
