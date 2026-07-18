import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Agent logging contracts", () => {
  it("does not attach user identity to Agent creation failures", () => {
    const route = readSource("app/api/agents/route.ts");
    expect(route).toContain('console.error("agent_run_creation_failed", { errorCode:');
    expect(route).not.toContain('console.error("agent_run_creation_failed", { userId');
  });

  it("keeps background rejection logs to task metadata and a safe error code", () => {
    const backgroundTask = readSource("features/generation/background-task.ts");
    const loggedFields = backgroundTask.match(/console\.error\("generation_background_task_rejected", \{([\s\S]*?)\}\);/)?.[1] ?? "";
    expect(loggedFields).toContain("taskType: context.taskType");
    expect(loggedFields).toContain("taskId: context.taskId");
    expect(loggedFields).toContain("errorCode: safeErrorCode(error)");
    expect(loggedFields).not.toContain("userId");
  });
});
