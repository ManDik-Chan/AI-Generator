import { jsonResponse } from "@/features/demos/runtime/http";
import { buildOpenApiDocument } from "@/features/demos/runtime/openapi";

export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET() {
  return jsonResponse(buildOpenApiDocument(), { requestId: crypto.randomUUID(), headers: { "Cache-Control": "public, max-age=300" } });
}
