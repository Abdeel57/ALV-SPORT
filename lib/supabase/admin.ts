import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con la service-role key: OMITE RLS. Uso exclusivo del servidor para
 * operaciones privilegiadas y acotadas (p. ej. el bootstrap de administrador).
 * Nunca debe importarse en código que llegue al navegador.
 */
export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para el cliente admin.",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
