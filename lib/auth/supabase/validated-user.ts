import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";

import { prisma } from "@/lib/database/prisma";

const sessionClaims = z.object({
  sub: z.string().uuid(),
  session_id: z.string().uuid(),
  exp: z.number().int().positive(),
});

/** Verify with Auth before correlating the token with its live server session. */
export async function getValidatedUser(supabase: Pick<SupabaseClient, "auth">): Promise<User | null> {
  try {
    // getSession handles refresh, but its stored user/claims never authorize access.
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (session.error || !token) return null;

    // Verify this exact token, including signature and current Auth user status.
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;

    const claims = sessionClaims.parse(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")));
    if (claims.sub !== data.user.id) return null;

    // /user rejects deleted sessions, but server not_after may expire before
    // the access JWT. Match the existing Registry session check without RLS changes.
    const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM auth.sessions
      WHERE id=${claims.session_id}::uuid AND user_id=${data.user.id}::uuid
        AND (not_after IS NULL OR not_after>clock_timestamp())
        AND to_timestamp(${claims.exp})>clock_timestamp()`;
    return rows.length === 1 ? data.user : null;
  } catch {
    // Auth/database failures must not turn an unverified cookie into a login.
    return null;
  }
}
