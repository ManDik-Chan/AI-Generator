import process from "node:process";

try { process.loadEnvFile?.(".env"); } catch { /* Environment variables may be provided by the shell. */ }

interface BackfillOptions { all: boolean; userId?: string; limit: number; batchSize: number; dryRun: boolean }

export function parseBackfillOptions(args: string[]): BackfillOptions {
  const all = args.includes("--all");
  const user = args.find((arg) => arg.startsWith("--user="))?.slice("--user=".length);
  if (all === Boolean(user)) throw new Error("必须且只能提供 --all 或 --user=<uuid>。");
  if (user && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user)) throw new Error("--user 必须是有效 UUID。");
  const readInteger = (name: string, fallback: number, maximum: number) => {
    const raw = args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`--${name} 必须是 1-${maximum} 的整数。`);
    return value;
  };
  return { all, userId: user, limit: readInteger("limit", 10_000, 100_000), batchSize: readInteger("batch-size", 16, 32), dryRun: args.includes("--dry-run") };
}

async function main() {
  const options = parseBackfillOptions(process.argv.slice(2));
  const [{ prisma }, { getEmbeddingProvider }, repository, textModule, { EmbeddingProviderError }] = await Promise.all([
    import("../lib/database/prisma"),
    import("../lib/ai/embeddings/provider"),
    import("../features/memory/embedding-repository"),
    import("../features/memory/embedding-text"),
    import("../lib/ai/embeddings/errors"),
  ]);
  const memories = await prisma.memory.findMany({
    where: { enabled: true, ...(options.userId ? { userId: options.userId } : {}) },
    orderBy: [{ userId: "asc" }, { id: "asc" }],
    take: options.limit,
    select: { id: true, userId: true, content: true, category: true, topicKey: true, keywords: true },
  });
  const { config, provider } = getEmbeddingProvider();
  const counters = { scanned: memories.length, skipped: 0, generated: 0, failed: 0 };
  const stale: Array<(typeof memories)[number] & { text: string; contentHash: string }> = [];
  for (const memory of memories) {
    const text = textModule.buildMemoryEmbeddingText(memory);
    const contentHash = textModule.computeMemoryEmbeddingHash(text);
    const existing = await repository.getMemoryEmbeddingMetadata(memory.id, memory.userId);
    if (existing?.contentHash === contentHash && existing.model === config.model && existing.dimensions === config.dimensions) counters.skipped += 1;
    else stale.push({ ...memory, text, contentHash });
  }
  if (!options.dryRun) {
    for (let offset = 0; offset < stale.length; offset += options.batchSize) {
      const batch = stale.slice(offset, offset + options.batchSize);
      try {
        const embeddings = await provider.embed({ input: batch.map((memory) => memory.text), model: config.model, dimensions: config.dimensions });
        for (let index = 0; index < batch.length; index += 1) {
          const memory = batch[index]!;
          try {
            await repository.upsertMemoryEmbedding({ memoryId: memory.id, userId: memory.userId, model: config.model, dimensions: config.dimensions, contentHash: memory.contentHash, embedding: embeddings[index]! });
            counters.generated += 1;
          } catch { counters.failed += 1; }
        }
      } catch (error) {
        counters.failed += batch.length;
        if (error instanceof EmbeddingProviderError && error.code === "RATE_LIMITED") {
          console.error("Embedding Provider 已限流，回填已停止；可稍后使用相同命令安全续跑。", { ...counters });
          process.exitCode = 1;
          break;
        }
      }
    }
  }
  console.info("Memory embedding backfill", counters);
  await prisma.$disconnect();
}

if (process.env.VITEST !== "true") {
  main().catch((error) => {
    const safeArgumentMessage = error instanceof Error && /^(?:必须|--(?:user|limit|batch-size))/u.test(error.message) ? error.message : undefined;
    console.error("Memory embedding backfill failed", { errorCode: error instanceof Error ? error.name : "UNKNOWN", ...(safeArgumentMessage ? { message: safeArgumentMessage } : {}) });
    process.exitCode = 1;
  });
}
