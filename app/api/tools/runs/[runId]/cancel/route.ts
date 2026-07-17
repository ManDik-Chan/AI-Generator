import { NextResponse } from "next/server";

import { toolRunIdSchema } from "@/features/tools/schemas";
import { cancelToolRun } from "@/features/tools/usage";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { prisma } from "@/lib/database/prisma";

export async function POST(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const supabase = await createSupabaseServerClient();
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const { runId } = await context.params;
  if (!toolRunIdSchema.safeParse(runId).success) return NextResponse.json({ message: "工具记录不存在或无权访问。" }, { status: 404 });
  const cancelled = await cancelToolRun(userId, runId);
  if (cancelled.count) return NextResponse.json({ status: "CANCELLED" });
  const existing = await prisma.toolRun.findFirst({ where: { id: runId, userId }, select: { status: true } });
  return existing
    ? NextResponse.json({ status: existing.status })
    : NextResponse.json({ message: "工具记录不存在或无权访问。" }, { status: 404 });
}
