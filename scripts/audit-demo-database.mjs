// Explicit source file, read-only transaction, aggregate/schema data only.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

async function main() {
  const source = process.argv[2];
  assert(source, "Explicit environment file required");
  const env = parseEnv(readFileSync(source,"utf8"));
  assert(env.DATABASE_URL, "DATABASE_URL required in source file");
  const url = new URL(env.DATABASE_URL);
  const ref = url.username.match(/^postgres\.([a-z]{20})$/)?.[1] ?? url.hostname.match(/^db\.([a-z]{20})\./)?.[1];
  const db = new PrismaClient({datasourceUrl:env.DATABASE_URL,log:[]});
  try {
    const result = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'");
      const migrations = await tx.$queryRawUnsafe("SELECT migration_name, checksum, finished_at IS NOT NULL AS applied, rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations ORDER BY started_at");
      const expected = readdirSync("prisma/migrations",{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort();
      const applied = migrations.filter(m=>m.applied && !m.rolled_back);
      const missing = expected.filter(name=>!applied.some(m=>m.migration_name===name));
      const checksumMismatch = applied.filter(m=>expected.includes(m.migration_name) && createHash("sha256").update(readFileSync(`prisma/migrations/${m.migration_name}/migration.sql`)).digest("hex")!==m.checksum).map(m=>m.migration_name);
      const memoryOrigins = await tx.$queryRawUnsafe("SELECT origin::text, count(*)::int AS count FROM memories GROUP BY origin");
      const assetOwnership = await tx.$queryRawUnsafe("SELECT count(*)::int AS invalid FROM tool_assets a LEFT JOIN tool_runs r ON r.id=a.tool_run_id AND r.user_id=a.user_id WHERE r.id IS NULL");
      const duplicateKeys = await tx.$queryRawUnsafe("SELECT count(*)::int AS invalid FROM (SELECT storage_bucket,storage_path FROM generated_images WHERE storage_path<>'' GROUP BY storage_bucket,storage_path HAVING count(*)>1) d");
      const avatarOwnership = await tx.$queryRawUnsafe("SELECT count(*)::int AS invalid FROM personas p LEFT JOIN generated_images i ON i.id=p.avatar_image_id AND i.user_id=p.user_id AND i.kind='PERSONA_AVATAR' WHERE p.avatar_image_id IS NOT NULL AND i.id IS NULL");
      const columns = await tx.$queryRawUnsafe("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name='memories' AND column_name IN ('revision','verification_method','verified_at')) OR (table_name='generated_images' AND column_name='deletion_requested_at')) ORDER BY table_name,column_name");
      return {applied:applied.length,missing,checksumMismatch,unfinished:migrations.filter(m=>!m.applied&&!m.rolled_back).map(m=>m.migration_name),memoryOrigins,assetOwnership,duplicateKeys,avatarOwnership,columns};
    },{timeout:25000});
    console.log(JSON.stringify({source,projectRef:ref??"local/other",...result},null,2));
  } finally { await db.$disconnect(); }
}
main().catch(()=>{console.error("Database read-only audit failed; raw SDK errors withheld");process.exitCode=1;});
