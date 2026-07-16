import { NextResponse } from "next/server";
import { requireAvatarApiUser } from "@/features/persona/avatar-api";
import { createPersonaAvatarSignedUrl } from "@/features/persona/avatar-storage";
import { personaIdSchema } from "@/features/persona/schemas";
import { prisma } from "@/lib/database/prisma";
import { resolveGeneratedImageStorageTarget } from "@/features/generated-images/storage-target";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ personaId: string }> }) {
  const user = await requireAvatarApiUser(); if (!user) return new NextResponse(null, { status: 401 });
  const { personaId } = await params; if (!personaIdSchema.safeParse(personaId).success) return new NextResponse(null, { status: 404 });
  const persona = await prisma.persona.findFirst({ where: { id: personaId, userId: user.id }, select: { avatarImage: { select: { kind: true, storageBucket: true, storagePath: true } } } });
  if (!persona?.avatarImage) return new NextResponse(null, { status: 404 });
  try {
    const target = resolveGeneratedImageStorageTarget({ userId: user.id, kind: persona.avatarImage.kind, storedBucket: persona.avatarImage.storageBucket, storedPath: persona.avatarImage.storagePath });
    if (!target || target.kind !== "PERSONA_AVATAR") return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(await createPersonaAvatarSignedUrl(target), 307);
  }
  catch { return NextResponse.json({ error: "头像暂时无法读取。" }, { status: 503 }); }
}
