import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAvatarApiUser } from "@/features/persona/avatar-api";
import { deleteGeneratedAvatar } from "@/features/persona/avatar-service";
import {
  deleteToolGeneratedImage,
} from "@/features/tools/image-generation/service";
import { createGeneratedImageSignedUrl } from "@/features/tools/image-generation/storage";
import { prisma } from "@/lib/database/prisma";
import { resolveGeneratedImageStorageTarget } from "@/features/generated-images/storage-target";
import { AssetCleanupPending } from "@/features/storage/deletion";

export const runtime = "nodejs";
const imageIdSchema = z.uuid();
const message = (value: string, status: number) => NextResponse.json({ message: value }, { status });

function downloadExtension(mimeType: string | null) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

async function ownedImage(userId: string, id: string, includePending = false) {
  return prisma.generatedImage.findFirst({
    where: { id, userId, ...(includePending ? {} : { deletionRequestedAt: null }) },
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
  let target;
  try {
    target = resolveGeneratedImageStorageTarget({ userId: user.id, kind: image.kind, storedBucket: image.storageBucket, storedPath: image.storagePath });
  } catch {
    target = null;
  }
  if (!target) return new NextResponse(null, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = download
    ? `ai-generated-${image.id}.${downloadExtension(image.mimeType)}`
    : undefined;
  try {
    return NextResponse.redirect(
      await createGeneratedImageSignedUrl(
        target,
        filename,
      ),
      307,
    );
  } catch {
    return message("图片暂时无法读取。", 503);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ generatedImageId: string }> },
) {
  const user = await requireAvatarApiUser();
  if (!user) return message("请先登录。", 401);
  const { generatedImageId } = await params;
  if (!imageIdSchema.safeParse(generatedImageId).success) {
    return message("图片不存在。", 404);
  }
  const image = await ownedImage(user.id, generatedImageId, true);
  if (!image) return message("图片不存在。", 404);
  try {
    const target = resolveGeneratedImageStorageTarget({ userId: user.id, kind: image.kind, storedBucket: image.storageBucket, storedPath: image.storagePath });
    if (!target) return message("图片不存在。", 404);
  } catch {
    return message("图片不存在。", 404);
  }
  try {
    const result = image.kind === "TOOL_GENERATION"
      ? await deleteToolGeneratedImage(user.id, generatedImageId)
      : await deleteGeneratedAvatar(user.id, generatedImageId);
    if (result === "not-found") {
      return message("图片不存在。", 404);
    }
    if (result === "in-use") {
      return message("正在使用的头像不能删除。", 409);
    }
    return NextResponse.json({ success: true, state: "COMPLETE" });
  } catch (error) {
    if (error instanceof AssetCleanupPending) return NextResponse.json({ success: false, state: error.state, message: error.state === "BLOCKED" ? "无法确认资源归属，清理已停止。" : "图片清理尚未完成，请稍后重试。" }, { status: error.state === "BLOCKED" ? 409 : 503 });
    return message("图片删除失败，请稍后重试。", 500);
  }
}
