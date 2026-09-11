/**
 * Constructor de SQL parametrizado con plantillas etiquetadas.
 *
 *   sql`select * from teams where id = ${id}`
 *
 * Toda interpolación viaja como parámetro ($1, $2, …): no hay forma de
 * inyectar SQL con un valor. Los fragmentos se componen entre sí y los
 * identificadores dinámicos pasan por `ident()`, que valida y entrecomilla.
 */

/** Valores que Postgres acepta como parámetro (pg serializa objetos a JSON). */
export type SqlValue =
  | string
  | number
  | boolean
  | bigint
  | Date
  | Buffer
  | null
  | undefined
  | readonly SqlValue[]
  | { readonly [key: string]: unknown };

const IDENT = Symbol("alv.sql.ident");
const QUERY = Symbol("alv.sql.query");

/** Identificador validado (tabla, columna). Se interpola literal, no como parámetro. */
export interface SqlIdentifier {
  readonly [IDENT]: true;
  readonly quoted: string;
}

/** Consulta lista para `pg`: texto con $n y su arreglo de valores. */
export interface SqlQuery {
  readonly [QUERY]: true;
  readonly text: string;
  readonly values: readonly unknown[];
}

export type SqlPart = SqlQuery | SqlIdentifier | SqlValue;

function isIdentifier(value: unknown): value is SqlIdentifier {
  return typeof value === "object" && value !== null && IDENT in value;
}

export function isQuery(value: unknown): value is SqlQuery {
  return typeof value === "object" && value !== null && QUERY in value;
}

const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/i;

/**
 * Identificador dinámico. Solo acepta nombres simples (letras, dígitos y
 * guion bajo) y opcionalmente un esquema: `ident("public", "teams")`.
 * Cualquier otra cosa es un error, no un escape silencioso.
 */
export function ident(...parts: string[]): SqlIdentifier {
  if (parts.length === 0) throw new Error("ident() requiere al menos un nombre");
  for (const part of parts) {
    if (!SAFE_IDENT.test(part)) {
      throw new Error(`Identificador SQL inválido: ${JSON.stringify(part)}`);
    }
  }
  return { [IDENT]: true, quoted: parts.map((p) => `"${p}"`).join(".") };
}

interface Builder {
  text: string;
  values: unknown[];
}

function push(builder: Builder, part: SqlPart): void {
  if (isQuery(part)) {
    // Reindexa los $n del fragmento al offset actual.
    builder.text += part.text.replace(/\$(\d+)/g, (_match, digits: string) => {
      const index = Number(digits);
      return `$${builder.values.length + index}`;
    });
    builder.values.push(...part.values);
    return;
  }
  if (isIdentifier(part)) {
    builder.text += part.quoted;
    return;
  }
  builder.values.push(part === undefined ? null : part);
  builder.text += `$${builder.values.length}`;
}

export function sql(
  strings: TemplateStringsArray,
  ...parts: SqlPart[]
): SqlQuery {
  const builder: Builder = { text: "", values: [] };
  strings.forEach((chunk, index) => {
    builder.text += chunk;
    if (index < parts.length) push(builder, parts[index] as SqlPart);
  });
  return { [QUERY]: true, text: builder.text, values: builder.values };
}

/** Une fragmentos con un separador literal: `join(parts, " and ")`. */
export function join(parts: readonly SqlPart[], separator: string): SqlQuery {
  const builder: Builder = { text: "", values: [] };
  parts.forEach((part, index) => {
    if (index > 0) builder.text += separator;
    push(builder, part);
  });
  return { [QUERY]: true, text: builder.text, values: builder.values };
}

/** Fragmento vacío: neutro al componer. */
export const empty: SqlQuery = { [QUERY]: true, text: "", values: [] };

/**
 * `set` de un UPDATE desde un objeto: `update t ${assign(row)} where …`.
 * Las claves son identificadores validados; los valores, parámetros.
 */
export function assign(row: Record<string, SqlValue>): SqlQuery {
  const entries = Object.entries(row);
  if (entries.length === 0) throw new Error("assign() requiere al menos una columna");
  return join(
    entries.map(([column, value]) => sql`${ident(column)} = ${value}`),
    ", ",
  );
}

/**
 * Columnas y valores de un INSERT: `insert into t ${insertRow(row)}`.
 */
export function insertRow(row: Record<string, SqlValue>): SqlQuery {
  const entries = Object.entries(row);
  if (entries.length === 0) throw new Error("insertRow() requiere al menos una columna");
  const columns = join(entries.map(([column]) => ident(column)), ", ");
  const values = join(entries.map(([, value]) => sql`${value}`), ", ");
  return sql`(${columns}) values (${values})`;
}
