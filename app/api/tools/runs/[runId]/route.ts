import { NextResponse } from "next/server";

import { getToolRunDetail, getToolRunRecovery } from "@/features/tools/queries";
import { toolRunIdSchema } from "@/features/tools/schemas";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { prisma } from "@/lib/database/prisma";
import { cleanupToolRunAssets } from "@/features/tools/image/assets";
import { cleanupToolGeneratedImageForRun } from "@/features/tools/image-generation/service";
import { AssetCleanupPending } from "@/features/storage/deletion";

async function authenticatedUserId() {
  const supabase = await createSupabaseServerClient();
  return (await supabase.auth.getUser()).data.user?.id;
}

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const userId = await authenticatedUserId().catch(() => undefined);
  if (!userId) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const { runId } = await context.params;
  if (!toolRunIdSchema.safeParse(runId).success) return NextResponse.json({ message: "工具记录不存在或无权访问。" }, { status: 404 });
  const run = new URL(_request.url).searchParams.get("recovery") === "1"
    ? await getToolRunRecovery(userId, runId)
    : await getToolRunDetail(userId, runId);
  return run ? NextResponse.json(run) : NextResponse.json({ message: "工具记录不存在或无权访问。" }, { status: 404 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const userId = await authenticatedUserId().catch(() => undefined);
  if (!userId) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const { runId } = await context.params;
  if (!toolRunIdSchema.safeParse(runId).success) return NextResponse.json({ message: "工具记录不存在或无权访问。" }, { status: 404 });
  const owned = await prisma.toolRun.findFirst({ where: { id: runId, userId }, select: { id: true } });
  if (!owned) return NextResponse.json({ message: "工具记录不存在或无权访问。" }, { status: 404 });
  try {
    await cleanupToolRunAssets(userId, runId);
    await cleanupToolGeneratedImageForRun(userId, runId);
    const deleted = await prisma.toolRun.deleteMany({ where: { id: runId, userId } });
    return deleted.count ? NextResponse.json({ success: true, state: "COMPLETE" }) : NextResponse.json({ message: "工具记录不存在或无权访问。" }, { status: 404 });
  } catch (error) {
    const state = error instanceof AssetCleanupPending ? error.state : "FAILED";
    return NextResponse.json({ success: false, state, message: state === "BLOCKED" ? "无法确认资源归属，清理已停止。" : "删除尚未完成，请稍后重试。" }, { status: state === "BLOCKED" ? 409 : state === "PENDING" ? 503 : 500 });
  }
}
