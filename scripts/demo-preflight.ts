import { createRequire } from "node:module";
import { requireAiProviderConfig } from "../lib/ai/config";
import { createOpenAiCompatibleProvider } from "../lib/ai/providers/openai-compatible";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = createRequire(require.resolve("next/package.json"))("@next/env");
loadEnvConfig(process.cwd());

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  if (!process.versions.node.startsWith("22.")) throw new Error("Node 22.x required");
  const required = ["DATABASE_URL", "DIRECT_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "AI_BASE_URL", "AI_API_KEY", "AI_MODEL"];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(", ")}`);
  const config = requireAiProviderConfig();
  const providerUrl = new URL(config.baseUrl);
  if (["localhost", "127.0.0.1", "[::1]"].includes(providerUrl.hostname) || /mock|playwright/i.test(config.model)) {
    throw new Error("Demo refuses a loopback/mock Provider. Check .env.local overrides.");
  }
  console.log("PASS Node and required configuration; real remote Provider selected (values withheld)");
  const db = new PrismaClient({ log: [] });
  try {
    await db.$queryRaw`SELECT 1`;
    console.log("PASS Prisma read-only connectivity (no migrations or writes)");
  } finally { await db.$disconnect(); }
  const health = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! }, signal: AbortSignal.timeout(15000),
  });
  if (!health.ok) throw new Error(`Supabase Auth health HTTP ${health.status}`);
  console.log("PASS Supabase Auth health");
  if (process.argv.includes("--provider")) {
    const provider = createOpenAiCompatibleProvider({ ...config, requestTimeoutMs: 60000 });
    let output = "";
    let chunks = 0;
    for await (const delta of provider.streamText({
      model: config.model, messages: [{ role: "user", content: "Explain server-sent events in one short sentence." }],
      temperature: 0.2, maxOutputTokens: 200, thinking: "disabled",
    })) { output += delta; chunks++; }
    if (!output.trim()) throw new Error("Provider returned empty content");
    console.log(JSON.stringify({ check: "real-provider-stream", chunks, characters: output.length, output }));
  }
}
main().catch((error: unknown) => {
  // Never serialize SDK errors: connection strings or provider bodies may contain secrets.
  const safe = error instanceof Error && /^(Missing configuration:|Node 22|Demo refuses|Supabase Auth health|Provider returned)/.test(error.message);
  console.error(safe ? error.message : "Preflight failed; check network, database and Provider configuration privately.");
  process.exitCode = 1;
});
