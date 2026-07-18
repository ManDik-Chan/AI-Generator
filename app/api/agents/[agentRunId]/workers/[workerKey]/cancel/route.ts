import { NextResponse } from "next/server";
import { z } from "zod";

import { cancelAgentWorker } from "@/features/agents/worker-state";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";

const runIdSchema = z.string().uuid();
const workerKeySchema = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);

export async function POST(_request: Request, context: { params: Promise<{ agentRunId: string; workerKey: string }> }) {
  const userId = (await (await createSupabaseServerClient()).auth.getUser()).data.user?.id;
  if (!userId) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const { agentRunId, workerKey } = await context.params;
  if (!runIdSchema.safeParse(agentRunId).success || !workerKeySchema.safeParse(workerKey).success) {
    return NextResponse.json({ message: "Worker 不存在或无权访问。" }, { status: 404 });
  }
  const status = await cancelAgentWorker(userId, agentRunId, workerKey);
  return status
    ? NextResponse.json({ status })
    : NextResponse.json({ message: "Worker 不存在或无权访问。" }, { status: 404 });
}
