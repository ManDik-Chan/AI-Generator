import { describe, expect, it } from "vitest";

import { buildFallbackAgentPlan } from "@/features/agents/fallback-plan";
import { detectDependencyCycle, getDependencyDepth, validateAgentPlan } from "@/features/agents/graph";

function standardPlan() {
  return {
    overview: "A validated plan",
    workers: [
      { key: "one", name: "One", title: "One", objective: "One", expectedDeliverable: "One", priority: "HIGH", dependsOn: [] },
      { key: "two", name: "Two", title: "Two", objective: "Two", expectedDeliverable: "Two", priority: "MEDIUM", dependsOn: [] },
      { key: "three", name: "Three", title: "Three", objective: "Three", expectedDeliverable: "Three", priority: "LOW", dependsOn: ["one"] },
      { key: "four", name: "Four", title: "Four", objective: "Four", expectedDeliverable: "Four", priority: "HIGH", dependsOn: ["two", "three"] },
    ],
  };
}

describe("Agent Planner DAG validation", () => {
  it("requires exactly four Standard and six Deep Workers", () => {
    expect(validateAgentPlan(standardPlan(), "STANDARD").workers).toHaveLength(4);
    expect(() => validateAgentPlan(standardPlan(), "DEEP")).toThrow("exactly 6");
    expect(buildFallbackAgentPlan("STANDARD").workers).toHaveLength(4);
    expect(buildFallbackAgentPlan("DEEP").workers).toHaveLength(6);
  });

  it("rejects duplicate, missing, self and cyclic dependencies", () => {
    const duplicate = standardPlan();
    duplicate.workers[1].key = "one";
    expect(() => validateAgentPlan(duplicate, "STANDARD")).toThrow("unique");

    const missing = standardPlan();
    missing.workers[2].dependsOn = ["missing"];
    expect(() => validateAgentPlan(missing, "STANDARD")).toThrow("does not exist");

    const self = standardPlan();
    self.workers[0].dependsOn = ["one"];
    expect(() => validateAgentPlan(self, "STANDARD")).toThrow("itself");

    const cycle = standardPlan();
    cycle.workers[0].dependsOn = ["four"];
    expect(() => validateAgentPlan(cycle, "STANDARD")).toThrow("DAG");
  });

  it("rejects Planner attempts to choose tools, models or call counts", () => {
    for (const forbidden of ["tools", "model", "callCount", "temperature"]) {
      expect(() => validateAgentPlan({ ...standardPlan(), [forbidden]: "forbidden" }, "STANDARD")).toThrow();
    }
  });

  it("computes cycle and depth deterministically", () => {
    const graph = new Map([["a", []], ["b", ["a"]], ["c", ["b"]]]);
    expect(detectDependencyCycle(graph)).toBe(false);
    expect(getDependencyDepth(graph)).toBe(2);
    graph.set("a", ["c"]);
    expect(detectDependencyCycle(graph)).toBe(true);
  });
});
