import type { CookieOptions } from "@supabase/ssr";

// This preference contains no credentials and never authorizes a request.
export const AUTH_PERSISTENCE_COOKIE = "aig-auth-persistence";
export type SessionPersistence = "session" | "persistent" | "signed-out";
type CookieValue = { name: string; value: string };

export function readPersistence(cookies: CookieValue[]): SessionPersistence {
  const value = cookies.find(({ name }) => name === AUTH_PERSISTENCE_COOKIE)?.value;
  // Preserve existing sessions created before the preference was introduced.
  return value === "session" || value === "signed-out" ? value : "persistent";
}

export function persistenceOptions(mode: SessionPersistence, secure: boolean): CookieOptions {
  return { path: "/", sameSite: "lax", secure, ...(mode === "session" ? {} : { maxAge: 400 * 24 * 60 * 60 }) };
}

export function sessionCookieOptions(options: CookieOptions, mode: SessionPersistence): CookieOptions {
  // Keep SDK removal instructions, including obsolete chunk deletion, intact.
  if (mode !== "session" || (options.maxAge !== undefined && options.maxAge <= 0)) return options;
  const result = { ...options };
  delete result.maxAge;
  delete result.expires;
  return result;
}

export function authCookieName(url: string) {
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

export function isSessionCookie(name: string, url: string) {
  const key = authCookieName(url);
  return name === key || name.startsWith(`${key}.`) || name.startsWith(`${key}-`);
}

export function readableAuthCookies(cookies: CookieValue[]) {
  // A logout tombstone prevents an older in-flight refresh response from restoring login.
  return readPersistence(cookies) === "signed-out" ? [] : cookies;
}
