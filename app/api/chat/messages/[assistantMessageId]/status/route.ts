import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { prisma } from "@/lib/database/prisma";

const idSchema = z.string().uuid();

export async function GET(_request: Request, context: { params: Promise<{ assistantMessageId: string }> }) {
  const userId = (await (await createSupabaseServerClient()).auth.getUser()).data.user?.id;
  if (!userId) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const { assistantMessageId } = await context.params;
  if (!idSchema.safeParse(assistantMessageId).success) return NextResponse.json({ message: "消息不存在或无权访问。" }, { status: 404 });
  const message = await prisma.message.findFirst({
    where: { id: assistantMessageId, role: "ASSISTANT", conversation: { userId } },
    select: { id: true, conversationId: true, content: true, status: true, createdAt: true },
  });
  return message
    ? NextResponse.json({ ...message, createdAt: message.createdAt.toISOString() })
    : NextResponse.json({ message: "消息不存在或无权访问。" }, { status: 404 });
}
