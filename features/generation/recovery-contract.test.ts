import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("durable generation recovery contract", () => {
  it("keeps the three text tool cards equal without index special-casing", () => {
    const source = read("app/tools/page.tsx");
    expect(source).toContain("grid items-stretch gap-4 md:grid-cols-3");
    expect(source).toContain("flex h-full");
    expect(source).not.toContain("row-span-2");
    expect(source).not.toContain("map((tool, index)");
  });

  it("registers an already-started promise with Vercel waitUntil", () => {
    const source = read("features/generation/background-task.ts");
    expect(source).toContain("waitUntil(guarded)");
    expect(source).toContain("after(() => guarded)");
    expect(source).not.toContain("Promise.resolve().then");
  });

  it("treats request abort, stream cancel and enqueue failure as observer detach", () => {
    const source = read("features/generation/sse-observer.ts");
    expect(source).toContain('addEventListener("abort", detach');
    expect(source).toContain("cancel() { observer.detach(); }");
    expect(source).not.toContain("AbortController");
  });

  it("uses durable, owner-scoped idempotent ToolRun cancellation", () => {
    const source = read("app/api/tools/runs/[runId]/cancel/route.ts");
    expect(source).toContain("cancelToolRun(userId, runId)");
    expect(source).toContain("findFirst({ where: { id: runId, userId }");
  });

  it("uses durable, owner-scoped chat cancellation", () => {
    const source = read("app/api/chat/messages/[assistantMessageId]/cancel/route.ts");
    expect(source).toContain('status: "PENDING"');
    expect(source).toContain('data: { status: "CANCELLED" }');
    expect(source).toContain("conversation: { userId }");
  });

  it("persists chat partial output without completing the message", () => {
    const persistence = read("features/chat/persistence.ts");
    const route = read("app/api/chat/route.ts");
    expect(persistence).toContain("persistAssistantPartial");
    expect(route).toContain("Date.now() - lastPersistedAt >= 750");
    expect(route).toContain("persistAssistantPartial(assistantMessageId, fullContent)");
  });

  it("keeps ToolRun partial output recoverable with a short privacy TTL", () => {
    const source = read("features/tools/usage.ts");
    expect(source).toContain("RECOVERY_TTL_MS = 15 * 60_000");
    expect(source).toContain("recoveryExpiresAt");
  });

  it("checks durable state around image generation persistence", () => {
    const source = read("features/tools/image-generation/service.ts");
    expect(source.match(/assertRunPending\(/g)?.length).toBeGreaterThan(4);
    expect(source).toContain("removeGeneratedImageObject(storageTarget)");
  });

  it("stores persona draft and avatar jobs in GenerationRun", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toContain("model GenerationRun");
    expect(schema).toContain("PERSONA_DRAFT");
    expect(schema).toContain("PERSONA_AVATAR");
  });

  it("recovery only queries existing ids on visibility, pageshow and focus", () => {
    const source = read("features/generation/use-generation-recovery.ts");
    expect(source).toContain('addEventListener("visibilitychange"');
    expect(source).toContain('addEventListener("pageshow"');
    expect(source).toContain('addEventListener("focus"');
    expect(source).toContain("document.visibilityState === \"hidden\"");
    expect(source).not.toContain('method: "POST"');
  });

  it("passes the durable cancellation signal to every long-running provider", () => {
    for (const path of ["app/api/chat/route.ts", "app/api/tools/run/route.ts", "app/api/tools/image/run/route.ts", "app/api/tools/image-generate/route.ts", "app/api/personas/generate/route.ts", "app/api/personas/[personaId]/avatar/generate/route.ts"]) {
      const source = read(path);
      expect(source).toContain("createDurableCancellationController");
      expect(source).toContain("cancellation.signal");
      expect(source).toContain("cancellation.dispose()");
    }
  });

  it("queues explicit cancel intent until a durable id arrives", () => {
    for (const path of ["features/chat/components/chat-layout.tsx", "features/tools/components/tool-runner.tsx", "features/tools/components/image-analyzer.tsx", "features/tools/components/image-generation-workspace.tsx", "features/persona/components/ai-persona-generator.tsx", "features/persona/components/ai-avatar-dialog.tsx"]) {
      const source = read(path);
      expect(source).toContain("pendingCancelRef");
      expect(source).toContain("正在请求停止");
      expect(source).toContain("requestDurableCancellation");
    }
  });

  it("does not call cancel APIs from recovery visibility or unmount effects", () => {
    const recovery = read("features/generation/use-generation-recovery.ts");
    expect(recovery).not.toContain("/cancel");
    expect(recovery).not.toContain('method: "POST"');
  });

  it("configures long routes for Node.js and a bounded duration", () => {
    for (const path of ["app/api/chat/route.ts", "app/api/tools/run/route.ts", "app/api/tools/image/run/route.ts", "app/api/tools/image-generate/route.ts", "app/api/personas/generate/route.ts", "app/api/personas/[personaId]/avatar/generate/route.ts"]) {
      const source = read(path);
      expect(source).toContain('runtime = "nodejs"');
      expect(source).toContain("maxDuration = 300");
      expect(source).toContain("registerGenerationTask");
    }
  });
});
