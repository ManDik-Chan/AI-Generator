import "server-only";

import { createClient } from "@supabase/supabase-js";
import { ImageProviderError } from "@/lib/ai/image/errors";

export function createSupabaseAdminClient(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) throw new ImageProviderError("STORAGE", "Supabase avatar storage is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
