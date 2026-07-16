import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para componentes cliente ("use client").
 * Lee el env de forma diferida: el proyecto compila y la landing renderiza
 * sin un proyecto de Supabase configurado (ver README para conectar uno).
 */
export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY. Copia .env.example a .env.local y llena tus credenciales.",
    );
  }
  return createBrowserClient(url, anonKey);
}
