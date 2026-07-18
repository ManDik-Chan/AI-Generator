import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedAgentRunStatus } from "@/features/agents/queries";
import { reconcileStaleAgentRun } from "@/features/agents/run-state";
import { getAgentStaleAfterMs } from "@/lib/ai/config";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";

const runIdSchema = z.string().uuid();

export async function GET(_request: Request, context: { params: Promise<{ agentRunId: string }> }) {
  const startedAt = performance.now();
  const userId = (await (await createSupabaseServerClient()).auth.getUser()).data.user?.id;
  if (!userId) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const { agentRunId } = await context.params;
  if (!runIdSchema.safeParse(agentRunId).success) return NextResponse.json({ message: "Agent 运行不存在或无权访问。" }, { status: 404 });

  let result = await getOwnedAgentRunStatus(userId, agentRunId);
  const staleBefore = new Date(Date.now() - getAgentStaleAfterMs());
  if (result?.status === "PENDING" && new Date(result.startedAt) <= staleBefore) {
    await reconcileStaleAgentRun(userId, agentRunId, staleBefore);
    result = await getOwnedAgentRunStatus(userId, agentRunId);
  }
  return result
    ? NextResponse.json(result, { headers: { "Cache-Control": "private, no-store", "Server-Timing": `total;dur=${(performance.now() - startedAt).toFixed(1)}` } })
    : NextResponse.json({ message: "Agent 运行不存在或无权访问。" }, { status: 404 });
}
