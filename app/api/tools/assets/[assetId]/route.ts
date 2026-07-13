import { NextResponse } from "next/server";
import { z } from "zod";

import { createToolAssetSignedUrl } from "@/features/tools/image/storage";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { prisma } from "@/lib/database/prisma";

export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params; if (!z.string().uuid().safeParse(assetId).success) return NextResponse.json({ message: "资源不存在。" }, { status: 404 });
  const supabase = await createSupabaseServerClient(); const { data } = await supabase.auth.getUser(); if (!data.user) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const asset = await prisma.toolAsset.findFirst({ where: { id: assetId, userId: data.user.id }, select: { storagePath: true, expiresAt: true } });
  if (!asset) return NextResponse.json({ message: "资源不存在。" }, { status: 404 });
  if (!asset.storagePath || asset.expiresAt <= new Date()) return NextResponse.json({ message: "原图片已到期清理。" }, { status: 410 });
  try { return NextResponse.redirect(await createToolAssetSignedUrl(asset.storagePath), 302); } catch { return NextResponse.json({ message: "图片暂时不可用。" }, { status: 503 }); }
}
