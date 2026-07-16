import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAvatarApiUser } from "@/features/persona/avatar-api";
import { deleteGeneratedAvatar } from "@/features/persona/avatar-service";
import {
  deleteToolGeneratedImage,
} from "@/features/tools/image-generation/service";
import { createGeneratedImageSignedUrl } from "@/features/tools/image-generation/storage";
import { prisma } from "@/lib/database/prisma";

export const runtime = "nodejs";
const imageIdSchema = z.uuid();

function downloadExtension(mimeType: string | null) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

async function ownedImage(userId: string, id: string) {
  return prisma.generatedImage.findFirst({
    where: { id, userId },
    select: {
      id: true,
      kind: true,
      storagePath: true,
      storageBucket: true,
      mimeType: true,
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ generatedImageId: string }> },
) {
  const user = await requireAvatarApiUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { generatedImageId } = await params;
  if (!imageIdSchema.safeParse(generatedImageId).success) {
    return new NextResponse(null, { status: 404 });
  }
  const image = await ownedImage(user.id, generatedImageId);
  if (!image) return new NextResponse(null, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = download
    ? `ai-generated-${image.id}.${downloadExtension(image.mimeType)}`
    : undefined;
  try {
    return NextResponse.redirect(
      await createGeneratedImageSignedUrl(
        image.storageBucket,
        image.storagePath,
        filename,
      ),
      307,
    );
  } catch {
    return NextResponse.json({ error: "图片暂时无法读取。" }, { status: 503 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ generatedImageId: string }> },
) {
  const user = await requireAvatarApiUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { generatedImageId } = await params;
  if (!imageIdSchema.safeParse(generatedImageId).success) {
    return NextResponse.json({ error: "图片不存在。" }, { status: 404 });
  }
  const image = await ownedImage(user.id, generatedImageId);
  if (!image) return NextResponse.json({ error: "图片不存在。" }, { status: 404 });
  try {
    const result = image.kind === "TOOL_GENERATION"
      ? await deleteToolGeneratedImage(user.id, generatedImageId)
      : await deleteGeneratedAvatar(user.id, generatedImageId);
    if (result === "not-found") {
      return NextResponse.json({ error: "图片不存在。" }, { status: 404 });
    }
    if (result === "in-use") {
      return NextResponse.json({ error: "正在使用的头像不能删除。" }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "图片删除失败，请稍后重试。" }, { status: 500 });
  }
}
