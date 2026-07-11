"use client";

import { createBrowserClient } from "@supabase/ssr";

import { requireSupabasePublicConfig } from "@/lib/env/supabase";

export function createSupabaseBrowserClient() {
  const { url, anonKey } = requireSupabasePublicConfig();
  return createBrowserClient(url, anonKey);
}
