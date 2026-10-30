import { handleListCapabilities } from "@/features/demos/runtime/handlers";

// Public demo API: no session, no cookies, no database. See docs/developer/api-reference.md.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return handleListCapabilities();
}
