import { getCurrentUser } from "@/lib/auth/session";
import { SessionSync } from "./session-sync";

/** Bind tab validation to the same server-verified viewer as the rendered page. */
export async function SessionBoundary() {
  const user = await getCurrentUser();
  return user ? <SessionSync viewerId={user.id} /> : null;
}
