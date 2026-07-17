import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { prisma } from "@/lib/database/prisma";

const idSchema = z.string().uuid();

export async function POST(_request: Request, context: { params: Promise<{ assistantMessageId: string }> }) {
  const userId = (await (await createSupabaseServerClient()).auth.getUser()).data.user?.id;
  if (!userId) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const { assistantMessageId } = await context.params;
  if (!idSchema.safeParse(assistantMessageId).success) return NextResponse.json({ message: "消息不存在或无权访问。" }, { status: 404 });

  const cancelled = await prisma.message.updateMany({
    where: { id: assistantMessageId, role: "ASSISTANT", status: "PENDING", supersededAt: null, conversation: { userId } },
    data: { status: "CANCELLED" },
  });
  if (cancelled.count) return NextResponse.json({ status: "CANCELLED" });
  const existing = await prisma.message.findFirst({
    where: { id: assistantMessageId, role: "ASSISTANT", conversation: { userId } },
    select: { status: true },
  });
  return existing
    ? NextResponse.json({ status: existing.status })
    : NextResponse.json({ message: "消息不存在或无权访问。" }, { status: 404 });
}
