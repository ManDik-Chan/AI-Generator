import { NextResponse } from "next/server";
import { requireAvatarApiUser } from "@/features/persona/avatar-api";
import { createPersonaAvatarSignedUrl } from "@/features/persona/avatar-storage";
import { personaIdSchema } from "@/features/persona/schemas";
import { prisma } from "@/lib/database/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ personaId: string }> }) {
  const user = await requireAvatarApiUser(); if (!user) return new NextResponse(null, { status: 401 });
  const { personaId } = await params; if (!personaIdSchema.safeParse(personaId).success) return new NextResponse(null, { status: 404 });
  const persona = await prisma.persona.findFirst({ where: { id: personaId, userId: user.id }, select: { avatarImage: { select: { storagePath: true } } } });
  if (!persona?.avatarImage) return new NextResponse(null, { status: 404 });
  try { return NextResponse.redirect(await createPersonaAvatarSignedUrl(persona.avatarImage.storagePath), 307); }
  catch { return NextResponse.json({ error: "头像暂时无法读取。" }, { status: 503 }); }
}
