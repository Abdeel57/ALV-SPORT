import { seedProvider } from "./seed-provider";
import { supabaseProvider } from "./supabase-provider";
import type { PublicDataProvider } from "./types";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export * from "./types";

/**
 * Con proyecto de Supabase configurado, el sitio público lee de la base
 * (con Realtime). Sin él, se sirve la temporada seed calculada con el motor
 * — misma UI, misma lógica, cero red.
 */
export function getPublicData(): PublicDataProvider {
  return hasSupabaseEnv() ? supabaseProvider : seedProvider;
}
