import { NextResponse } from "next/server";
import { z } from "zod";

import { cancelGenerationRun, getGenerationRun } from "@/features/generation/runs";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";

const idSchema = z.string().uuid();

export async function POST(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const userId = (await (await createSupabaseServerClient()).auth.getUser()).data.user?.id;
  if (!userId) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const { runId } = await context.params;
  if (!idSchema.safeParse(runId).success) return NextResponse.json({ message: "任务不存在或无权访问。" }, { status: 404 });
  const cancelled = await cancelGenerationRun(userId, runId);
  if (cancelled.count) return NextResponse.json({ status: "CANCELLED" });
  const existing = await getGenerationRun(userId, runId);
  return existing ? NextResponse.json({ status: existing.status }) : NextResponse.json({ message: "任务不存在或无权访问。" }, { status: 404 });
}
