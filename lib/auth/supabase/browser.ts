"use client";

import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";

import { requireSupabasePublicConfig } from "@/lib/env/supabase";
import { readableAuthCookies, readPersistence, sessionCookieOptions } from "./persistence";

export function createSupabaseBrowserClient() {
  const { url, anonKey } = requireSupabasePublicConfig();
  const getCookies = () => parseCookieHeader(document.cookie).map(({ name, value }) => ({ name, value: value ?? "" }));
  return createBrowserClient(url, anonKey, {
    cookies: {
      getAll: () => readableAuthCookies(getCookies()),
      setAll(cookiesToSet) {
        const mode = readPersistence(getCookies());
        for (const { name, value, options } of cookiesToSet) {
          if (mode === "signed-out" && value) continue;
          document.cookie = serializeCookieHeader(name, value, sessionCookieOptions(options, mode));
        }
      },
    },
  });
}
