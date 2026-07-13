import { cleanupExpiredToolAssets } from "@/features/tools/image/assets";
import { prisma } from "@/lib/database/prisma";

async function main() { console.info("Tool asset cleanup", await cleanupExpiredToolAssets(new Date(), 500)); }
main().catch(() => { console.error("Tool asset cleanup failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
