import { handleGetCapability } from "@/features/demos/runtime/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ capabilityId: string }> }) {
  return handleGetCapability((await params).capabilityId);
}
