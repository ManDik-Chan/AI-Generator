import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicConfig } from "@/lib/env/supabase";
import { isPlatformPath } from "@/lib/auth/return-path";
import { readableAuthCookies, readPersistence, sessionCookieOptions } from "./persistence";
import { getValidatedUser } from "./validated-user";

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupabasePublicConfig();
  const isProtected = isPlatformPath(request.nextUrl.pathname);

  // Login also refreshes cookies before its Server Component restores a session.
  // The public brand page still never waits for Auth or reads user data.
  if (!isProtected && request.nextUrl.pathname !== "/login") return response;

  if (!config) {
    if (isProtected) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      loginUrl.searchParams.set("configuration", "missing");
      return NextResponse.redirect(loginUrl);
    }

    return response;
  }

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => readableAuthCookies(request.cookies.getAll()),
      setAll(cookiesToSet, headers) {
        const mode = readPersistence(request.cookies.getAll());
        cookiesToSet = cookiesToSet.filter(({ value }) => mode !== "signed-out" || !value);
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, sessionCookieOptions(options, mode)));
        Object.entries(headers ?? {}).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const user = await getValidatedUser(supabase);

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    const redirect = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    for (const name of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(name);
      if (value) redirect.headers.set(name, value);
    }
    return redirect;
  }

  return response;
}
