import { NextResponse } from "next/server";
import { avatarApiError, requireAvatarApiUser } from "@/features/persona/avatar-api";
import { applyPersonaAvatar } from "@/features/persona/avatar-service";
import { avatarApplySchema, personaIdSchema } from "@/features/persona/schemas";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ personaId: string }> }) {
  const user = await requireAvatarApiUser(); if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { personaId } = await params; if (!personaIdSchema.safeParse(personaId).success) return NextResponse.json({ error: "人格不存在。" }, { status: 404 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效。" }, { status: 400 }); }
  const parsed = avatarApplySchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "候选头像或提示词格式无效。" }, { status: 400 });
  try {
    const applied = await applyPersonaAvatar(user.id, personaId, parsed.data.generatedImageId, parsed.data.prompt);
    return applied ? NextResponse.json({ success: true, ...applied }) : NextResponse.json({ error: "人格或候选头像不存在。" }, { status: 404 });
  } catch (error) { return avatarApiError(error); }
}
