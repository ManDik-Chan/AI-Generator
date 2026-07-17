import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { ToolType } from "@prisma/client";

const read = (path: string) => readFileSync(path, "utf8");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260717180000_add_brainstorm_workers/migration.sql");
const rls = read("prisma/rls.sql");
const route = read("app/api/tools/brainstorm/route.ts");
const service = read("features/tools/brainstorm/service.ts");
const usage = read("features/tools/usage.ts");
const workspace = read("features/tools/brainstorm/brainstorm-workspace.tsx");
const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

describe("Phase 7A1 brainstorm contracts", () => {
  it("regenerates the Prisma Client on every production build", () => {
    expect(packageJson.scripts.postinstall).toBe("prisma generate");
    expect(packageJson.scripts.prebuild).toBe("prisma generate");
    expect(packageJson.scripts.build).toBe("next build");
    expect(ToolType.BRAINSTORM).toBe("BRAINSTORM");
  });

  it("adds BRAINSTORM and four worker roles in an independent migration", () => {
    expect(schema).toContain("BRAINSTORM");
    for (const role of ["ANALYST", "CREATIVE", "CRITIC", "PLANNER"]) expect(schema).toContain(role);
    expect(migration).toContain("brainstorm_workers_tool_run_id_user_id_fkey");
    expect(migration).toContain('FOREIGN KEY ("tool_run_id", "user_id")');
    expect(migration).toContain("ON DELETE CASCADE");
  });

  it("allows authenticated clients to select only their own workers", () => {
    const policies = rls.slice(rls.indexOf("alter table public.brainstorm_workers enable row level security"));
    expect(policies).toContain('create policy "brainstorm_workers_select_own"');
    expect(policies).toContain("for select using (user_id = auth.uid())");
    expect(policies).not.toContain('create policy "brainstorm_workers_insert');
    expect(policies).not.toContain('create policy "brainstorm_workers_update');
    expect(policies).not.toContain('create policy "brainstorm_workers_delete');
  });

  it("creates one run, registers waitUntil and keeps SSE transport observer-only", () => {
    expect(route.match(/createPendingBrainstormToolRun\(/g)).toHaveLength(1);
    expect(route).toContain("registerGenerationTask(generation");
    expect(route).toContain("createObservedSseResponse(observer, task, request.signal)");
    expect(route).not.toContain("request.signal.addEventListener");
  });

  it("creates brainstorm workers explicitly after the parent run without nested create", () => {
    const start = usage.indexOf("export async function createPendingBrainstormToolRun");
    const end = usage.indexOf("export async function getBrainstormUsage", start);
    const implementation = usage.slice(start, end);
    expect(implementation).toContain("transaction.toolRun.create");
    expect(implementation).toContain("transaction.brainstormWorker.createMany");
    expect(implementation).toContain("toolRunId: run.id");
    expect(implementation).not.toMatch(/brainstormWorkers\s*:\s*\{\s*create\s*:/);
    expect(implementation).not.toContain("skipDuplicates");
  });

  it("runs fixed workers with a maximum of one synthesis call and no retry loop", () => {
    expect(service).toContain("BRAINSTORM_WORKERS.map");
    expect(service).toContain("await runWithConcurrency(tasks, input.config.maxConcurrency)");
    expect(service).toContain("successful.length < 2");
    expect(service.match(/input\.provider\.streamText\(/g)).toHaveLength(1);
    expect(service).not.toContain("retry");
  });

  it("uses owner-scoped pending guards for worker and run terminal writes", () => {
    expect(service).toContain("toolRunId: input.runId, userId: input.userId");
    expect(service).toContain('status: "PENDING"');
    expect(service).toContain("finishRecoverableToolRun");
  });

  it("recovers existing runs without starting another provider call", () => {
    expect(workspace).toContain("useGenerationRecovery");
    expect(workspace).toContain('statusUrl: "/api/tools/runs/"');
    expect(workspace).toContain("requestDurableCancellation");
    expect(workspace).not.toContain("visibilitychange");
  });

  it("provides four real worker cards and responsive grids", () => {
    expect(workspace).toContain("workers.map");
    expect(workspace).toContain("md:grid-cols-2");
    expect(workspace).toContain("min-w-0");
    expect(workspace).not.toContain("progress:");
    expect(workspace).not.toContain("confidence");
  });

  it("writes local Next metadata icons with the required dimensions", async () => {
    for (const path of ["app/favicon.ico", "app/icon.png", "app/apple-icon.png", "public/brand/ai-generator-icon.png"]) expect(existsSync(path)).toBe(true);
    await expect(sharp("app/icon.png").metadata()).resolves.toMatchObject({ width: 512, height: 512 });
    await expect(sharp("app/apple-icon.png").metadata()).resolves.toMatchObject({ width: 180, height: 180 });
    const layout = read("app/layout.tsx");
    expect(layout).toContain('default: "AI-Generator"');
    expect(layout).toContain('url: "/favicon.ico"');
    expect(layout).not.toContain("http");
  });
});
