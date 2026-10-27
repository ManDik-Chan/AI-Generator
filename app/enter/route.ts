import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabasePublicConfig } from "@/lib/env/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = getSupabasePublicConfig() ? await getCurrentUser().catch(() => null) : null;
  const response = NextResponse.redirect(new URL(user ? "/workspace" : "/login?next=%2Fworkspace", request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
