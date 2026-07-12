import { NextResponse } from "next/server";
import { avatarApiError, requireAvatarApiUser } from "@/features/persona/avatar-api";
import { generatePersonaAvatarCandidate } from "@/features/persona/avatar-service";
import { avatarGenerateSchema, personaIdSchema } from "@/features/persona/schemas";
import { logImageSafetyDiagnostic } from "@/lib/ai/image/errors";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ personaId: string }> }) {
  const user = await requireAvatarApiUser(); if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { personaId } = await params; if (!personaIdSchema.safeParse(personaId).success) return NextResponse.json({ error: "人格不存在。" }, { status: 404 });
  let body: unknown; try { body = await request.json(); } catch { body = {}; }
  const parsed = avatarGenerateSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "头像提示词必须为 1 至 900 个字符。" }, { status: 400 });
  try {
    const candidate = await generatePersonaAvatarCandidate(user.id, personaId, parsed.data.prompt, request.signal);
    return candidate ? NextResponse.json(candidate) : NextResponse.json({ error: "人格不存在。" }, { status: 404 });
  } catch (error) { logImageSafetyDiagnostic(error); return avatarApiError(error); }
}
