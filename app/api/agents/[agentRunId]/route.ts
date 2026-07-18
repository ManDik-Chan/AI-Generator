import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnedAgentRunSnapshot } from "@/features/agents/queries";
import { getAgentDailyCreditLimit } from "@/lib/ai/config";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { prisma } from "@/lib/database/prisma";

const runIdSchema = z.string().uuid();

export async function GET(_request: Request, context: { params: Promise<{ agentRunId: string }> }) {
  const userId = (await (await createSupabaseServerClient()).auth.getUser()).data.user?.id;
  if (!userId) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const { agentRunId } = await context.params;
  if (!runIdSchema.safeParse(agentRunId).success) return NextResponse.json({ message: "Agent 运行不存在或无权访问。" }, { status: 404 });
  const result = await getOwnedAgentRunSnapshot(userId, agentRunId, getAgentDailyCreditLimit());
  return result ? NextResponse.json(result) : NextResponse.json({ message: "Agent 运行不存在或无权访问。" }, { status: 404 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ agentRunId: string }> }) {
  const userId = (await (await createSupabaseServerClient()).auth.getUser()).data.user?.id;
  if (!userId) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const { agentRunId } = await context.params;
  if (!runIdSchema.safeParse(agentRunId).success) return NextResponse.json({ message: "Agent 运行不存在或无权访问。" }, { status: 404 });
  const ownedRun = await prisma.agentRun.findFirst({ where: { id: agentRunId, userId }, select: { status: true } });
  if (!ownedRun) return NextResponse.json({ message: "Agent 运行不存在或无权访问。" }, { status: 404 });
  if (ownedRun.status === "PENDING") {
    return NextResponse.json({ message: "运行中的 Agent 不能删除。请先停止并等待服务端确认终态。" }, { status: 409 });
  }
  const deleted = await prisma.agentRun.deleteMany({ where: { id: agentRunId, userId, status: { not: "PENDING" } } });
  return deleted.count ? new NextResponse(null, { status: 204 }) : NextResponse.json({ message: "Agent 运行状态已变化，请刷新后重试。" }, { status: 409 });
}
