import { handleCreateRun } from "@/features/demos/runtime/handlers";

// Runs execute inside this request (≤ 5 s run deadline). maxDuration leaves headroom for
// the response and is the platform's hard stop if a capability ever ignores its deadline.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export function POST(request: Request) {
  return handleCreateRun(request);
}
