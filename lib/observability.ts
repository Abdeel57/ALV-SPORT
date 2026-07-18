/**
 * Reporte de errores estructurado. Hoy emite JSON a stderr, que Railway (y
 * cualquier agregador de logs) captura e indexa — a diferencia de un
 * `console.error(err)` suelto, aquí cada error lleva contexto consultable.
 *
 * Listo para Sentry: cuando exista `SENTRY_DSN`, este es el único punto a
 * cambiar (instalar @sentry/nextjs y reenviar aquí); nada más en el código
 * llama a Sentry directamente.
 */

export interface ErrorContext {
  /** Dónde ocurrió: "route:/partido/[id]", "action:approveCoach", etc. */
  source?: string;
  /** Origen: servidor (RSC/route/action) o navegador del usuario. */
  runtime?: "server" | "client";
  digest?: string;
  path?: string;
  [key: string]: unknown;
}

interface StructuredError {
  level: "error";
  event: "app_error";
  message: string;
  stack?: string;
  ts: string;
  [key: string]: unknown;
}

function toRecord(error: unknown, context: ErrorContext): StructuredError {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    level: "error",
    event: "app_error",
    message: err.message,
    stack: err.stack,
    ts: new Date().toISOString(),
    runtime: "server",
    ...context,
  };
}

/** Reporta un error con contexto. Nunca lanza: la observabilidad no debe
 *  tumbar el request que intenta observar. */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  try {
    // Serialización JSON en una línea → parseable por el agregador de logs.
    console.error(JSON.stringify(toRecord(error, context)));
  } catch {
    // Si la serialización falla (referencias circulares), no rompas nada.
    console.error("app_error (no serializable):", error);
  }
}
