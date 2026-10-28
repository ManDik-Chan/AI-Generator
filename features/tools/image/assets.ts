import "server-only";

import { prisma } from "@/lib/database/prisma";
import { removeToolAssets } from "@/features/tools/image/storage";
import { prepareToolAssetDeletion, requestDeletion, performDeletion, retryAssetDeletions } from "@/features/storage/deletion";

export async function cleanupToolRunAssets(userId: string, runId: string) {
  const targets = await prepareToolAssetDeletion(userId, runId);
  for (const target of targets) {
    const id = await requestDeletion(target);
    await performDeletion(id, () => removeToolAssets([target.path]));
    // Never discard the source row before confirmed Storage removal + durable ack.
    await prisma.toolAsset.deleteMany({ where: { id: target.resourceId, userId, toolRunId: runId } });
  }
}

export async function cleanupExpiredToolAssets(now = new Date(), take = 100) {
  const rows = await prisma.toolAsset.findMany({ where: { expiresAt: { lte: now }, storagePath: { not: "" } }, orderBy: { expiresAt: "asc" }, take, select: { id: true, userId: true, toolRunId: true, storagePath: true } });
  let deleted = 0; let failed = 0;
  for (const row of rows) {
    try { await cleanupToolRunAssets(row.userId, row.toolRunId); deleted += 1; }
    catch { failed += 1; console.error("tool_asset_expiry_cleanup_failed", { userId: row.userId, runId: row.toolRunId, assetId: row.id }); }
  }
  return { scanned: rows.length, deleted, failed, retries: await retryAssetDeletions(take) };
}
