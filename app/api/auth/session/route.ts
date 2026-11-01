import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { getValidatedUser } from "@/lib/auth/supabase/validated-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Revalidate a returning tab without refreshing and remounting its current page. */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
  try {
    const user = await getValidatedUser(await createSupabaseServerClient());
    // No user data or credentials are exposed by this endpoint.
    // The caller's expected viewer is only a UI-isolation hint, never authorization.
    const status = !user ? 401 : request.headers.get("x-aig-viewer") === user.id ? 204 : 409;
    return new Response(null, { status, headers });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
