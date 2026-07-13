import { NextResponse } from "next/server";

import { getToolRunDetail } from "@/features/tools/queries";
import { toolRunIdSchema } from "@/features/tools/schemas";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { prisma } from "@/lib/database/prisma";

async function authenticatedUserId() {
  const supabase = await createSupabaseServerClient();
  return (await supabase.auth.getUser()).data.user?.id;
}

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const userId = await authenticatedUserId().catch(() => undefined);
  if (!userId) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const { runId } = await context.params;
  if (!toolRunIdSchema.safeParse(runId).success) return NextResponse.json({ message: "工具记录不存在或无权访问。" }, { status: 404 });
  const run = await getToolRunDetail(userId, runId);
  return run ? NextResponse.json(run) : NextResponse.json({ message: "工具记录不存在或无权访问。" }, { status: 404 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const userId = await authenticatedUserId().catch(() => undefined);
  if (!userId) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const { runId } = await context.params;
  if (!toolRunIdSchema.safeParse(runId).success) return NextResponse.json({ message: "工具记录不存在或无权访问。" }, { status: 404 });
  const deleted = await prisma.toolRun.deleteMany({ where: { id: runId, userId } });
  return deleted.count ? NextResponse.json({ success: true }) : NextResponse.json({ message: "工具记录不存在或无权访问。" }, { status: 404 });
}
