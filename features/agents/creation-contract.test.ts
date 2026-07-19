import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const creation = readFileSync("features/agents/creation.ts", "utf8");
const planning = readFileSync("features/agents/planning-service.ts", "utf8");

describe("Agent atomic creation and credits contract", () => {
  it("creates the complete durable send inside one Serializable transaction", () => {
    const start = creation.indexOf("export async function createPendingAgentRun");
    const end = creation.indexOf("export async function persistAgentPlan", start);
    const implementation = creation.slice(start, end);
    expect(implementation).toContain("Prisma.TransactionIsolationLevel.Serializable");
    for (const operation of ["conversation.create", "message.create", "agentRun.create", "RUN_CREATED"]) {
      expect(implementation).toContain(operation);
    }
    expect(implementation).not.toContain("getAiProvider");
    expect(implementation).not.toContain("streamText");
  });

  it("charges one Standard or two Deep credits at run creation", () => {
    expect(creation).toContain("getAgentModeLimits(run.mode).creditCost");
    expect(creation).toContain("used + limits.creditCost > input.dailyCredits");
    expect(creation).toContain("charged: limits.creditCost");
  });

  it("calls Planner only after reserving one durable Provider call", () => {
    expect(planning.indexOf("reservePlannerProviderCall")).toBeLessThan(planning.indexOf("createAgentPlanWithFallback"));
    expect(planning).toContain("persistAgentPlan");
  });
});
