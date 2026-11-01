import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { safeReturnPath } from "@/lib/auth/return-path";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const safeNext = safeReturnPath(request.nextUrl.searchParams.get("next"));

  if (code) {
    // Explicit PKCE completion may follow a new registration after a prior logout.
    const supabase = await createSupabaseServerClient("session");
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(safeNext, request.url));
    }
  }

  return NextResponse.redirect(new URL(`/login?error=callback&next=${encodeURIComponent(safeNext)}`, request.url));
}
