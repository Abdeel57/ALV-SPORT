/**
 * Fuente única de verdad del seed: estos objetos generan `supabase/seed.sql`
 * (vía `pnpm seed:generate`) Y alimentan las pruebas del motor en Vitest.
 * Así `pnpm test` calcula sobre exactamente lo que se siembra en la DB.
 */
export * from "./ids";
export * from "./softball-config";
export * from "./basketball-config";
export * from "./org-league-teams";
export * from "./games-events";
