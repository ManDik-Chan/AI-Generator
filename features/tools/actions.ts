"use server";

import { revalidatePath } from "next/cache";

import { toolRunIdSchema } from "@/features/tools/schemas";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { cleanupToolRunAssets } from "@/features/tools/image/assets";
import { cleanupToolGeneratedImageForRun } from "@/features/tools/image-generation/service";

export async function deleteToolRunAction(runId: string) {
  const user = await requireUser();
  if (!toolRunIdSchema.safeParse(runId).success) return { success: false, message: "工具记录不存在或无权访问。" };
  await cleanupToolRunAssets(user.id, runId);
  await cleanupToolGeneratedImageForRun(user.id, runId);
  const deleted = await prisma.toolRun.deleteMany({ where: { id: runId, userId: user.id } });
  if (!deleted.count) return { success: false, message: "工具记录不存在或无权访问。" };
  revalidatePath("/tools");
  revalidatePath("/tools/history");
  return { success: true, message: "工具记录已删除。" };
}
