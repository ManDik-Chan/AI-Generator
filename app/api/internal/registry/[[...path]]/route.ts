import { handleRegistryRead } from "@/features/registry/read-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path?: string[] }> };
async function handler(request: Request, context: Context) {
  const { path = [] } = await context.params;
  return handleRegistryRead(request, path);
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as HEAD, handler as OPTIONS };
