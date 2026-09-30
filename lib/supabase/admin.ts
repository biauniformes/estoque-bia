import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/**
 * Cliente com SERVICE ROLE — ignora RLS. Somente servidor, somente após
 * `requireAdmin()`. Nunca importar em Client Components (o "server-only" quebra o build).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  return createClient(supabaseUrl, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
