import { NextResponse } from "next/server";
import { requireAvatarApiUser } from "@/features/persona/avatar-api";
import { createPersonaAvatarSignedUrl } from "@/features/persona/avatar-storage";
import { deleteGeneratedAvatar } from "@/features/persona/avatar-service";
import { prisma } from "@/lib/database/prisma";
import { z } from "zod";

export const runtime = "nodejs";
const imageIdSchema = z.uuid();

async function ownedImage(userId: string, id: string) { return prisma.generatedImage.findFirst({ where: { id, userId }, select: { storagePath: true } }); }

export async function GET(_request: Request, { params }: { params: Promise<{ generatedImageId: string }> }) {
  const user = await requireAvatarApiUser(); if (!user) return new NextResponse(null, { status: 401 });
  const { generatedImageId } = await params; if (!imageIdSchema.safeParse(generatedImageId).success) return new NextResponse(null, { status: 404 });
  const image = await ownedImage(user.id, generatedImageId); if (!image) return new NextResponse(null, { status: 404 });
  try { return NextResponse.redirect(await createPersonaAvatarSignedUrl(image.storagePath), 307); }
  catch { return NextResponse.json({ error: "候选头像暂时无法读取。" }, { status: 503 }); }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ generatedImageId: string }> }) {
  const user = await requireAvatarApiUser(); if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { generatedImageId } = await params; if (!imageIdSchema.safeParse(generatedImageId).success) return NextResponse.json({ error: "候选头像不存在。" }, { status: 404 });
  try { const result = await deleteGeneratedAvatar(user.id, generatedImageId); if (result === "not-found") return NextResponse.json({ error: "候选头像不存在。" }, { status: 404 }); if (result === "in-use") return NextResponse.json({ error: "正在使用的头像不能删除。" }, { status: 409 }); return NextResponse.json({ success: true }); }
  catch { return NextResponse.json({ error: "候选头像删除失败，请稍后重试。" }, { status: 500 }); }
}
