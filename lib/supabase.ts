import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Cliente de servidor. null si no hay credenciales configuradas. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

export const usandoMemoria = supabase === null;
