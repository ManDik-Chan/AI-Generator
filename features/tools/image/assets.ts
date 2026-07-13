import "server-only";

import { prisma } from "@/lib/database/prisma";
import { removeToolAssets } from "@/features/tools/image/storage";

export async function cleanupToolRunAssets(userId: string, runId: string) {
  const rows = await prisma.toolAsset.findMany({ where: { userId, toolRunId: runId }, select: { id: true, storagePath: true } });
  if (!rows.length) return;
  try { await removeToolAssets(rows.map((row) => row.storagePath).filter(Boolean)); }
  catch { console.error("tool_asset_delete_failed", { userId, runId, assetCount: rows.length }); return; }
  await prisma.toolAsset.deleteMany({ where: { userId, id: { in: rows.map((row) => row.id) } } });
}

export async function cleanupExpiredToolAssets(now = new Date(), take = 100) {
  const rows = await prisma.toolAsset.findMany({ where: { expiresAt: { lte: now }, storagePath: { not: "" } }, orderBy: { expiresAt: "asc" }, take, select: { id: true, userId: true, toolRunId: true, storagePath: true } });
  let deleted = 0; let failed = 0;
  for (const row of rows) {
    try { await removeToolAssets([row.storagePath]); await prisma.toolAsset.updateMany({ where: { id: row.id, userId: row.userId }, data: { storagePath: "" } }); deleted += 1; }
    catch { failed += 1; console.error("tool_asset_expiry_cleanup_failed", { userId: row.userId, runId: row.toolRunId, assetId: row.id }); }
  }
  return { scanned: rows.length, deleted, failed };
}
