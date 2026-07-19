import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedAgentRunTerminal } from "@/features/agents/queries";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";

const runIdSchema = z.string().uuid();

export async function GET(_request: Request, context: { params: Promise<{ agentRunId: string }> }) {
  const userId = (await (await createSupabaseServerClient()).auth.getUser()).data.user?.id;
  if (!userId) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const { agentRunId } = await context.params;
  if (!runIdSchema.safeParse(agentRunId).success) {
    return NextResponse.json({ message: "Agent 运行不存在或无权访问。" }, { status: 404 });
  }
  const result = await getOwnedAgentRunTerminal(userId, agentRunId);
  return result
    ? NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
    : NextResponse.json({ message: "Agent 运行尚未进入终态、不存在或无权访问。" }, { status: 404 });
}
