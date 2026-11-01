import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requireSupabasePublicConfig } from "@/lib/env/supabase";
import { AUTH_PERSISTENCE_COOKIE, isSessionCookie, persistenceOptions, readableAuthCookies, readPersistence, sessionCookieOptions, type SessionPersistence } from "./persistence";

export async function createSupabaseServerClient(persistence?: Exclude<SessionPersistence, "signed-out">) {
  const { url, anonKey } = requireSupabasePublicConfig();
  const cookieStore = await cookies();
  const secure = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? url).protocol === "https:";

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        // Explicit auth must also see old chunks so the SDK can remove them.
        // The pinned SSR server client skips automatic session initialization.
        return persistence ? cookieStore.getAll() : readableAuthCookies(cookieStore.getAll());
      },
      setAll(cookiesToSet) {
        try {
          const mode = persistence ?? readPersistence(cookieStore.getAll());
          cookiesToSet.forEach(({ name, value, options }) => {
            if (mode === "signed-out" && value) return;
            cookieStore.set(name, value, sessionCookieOptions(options, mode));
          });
          if (persistence && cookiesToSet.some(({ name, value }) => value && isSessionCookie(name, url) && !name.includes("code-verifier"))) {
            cookieStore.set(AUTH_PERSISTENCE_COOKIE, persistence, persistenceOptions(persistence, secure));
          }
        } catch {
          // Server Components cannot write cookies. Middleware refreshes them.
        }
      },
    },
  });
}

export async function clearSupabaseSession() {
  const { url } = requireSupabasePublicConfig();
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (isSessionCookie(name, url)) cookieStore.set(name, "", { path: "/", maxAge: 0 });
  }
  const secure = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? url).protocol === "https:";
  cookieStore.set(AUTH_PERSISTENCE_COOKIE, "signed-out", persistenceOptions("signed-out", secure));
}
