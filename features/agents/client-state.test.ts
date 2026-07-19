import { describe, expect, it } from "vitest";

import { createPendingAgentRunView, mergeAgentRunStatus, reduceAgentStreamEvent } from "@/features/agents/client-state";

const identifiers = {
  runId: "11111111-1111-4111-8111-111111111111",
  conversationId: "22222222-2222-4222-8222-222222222222",
  userMessageId: "33333333-3333-4333-8333-333333333333",
  assistantMessageId: "44444444-4444-4444-8444-444444444444",
};

describe("Agent client stream state", () => {
  it("builds a pending run only from server-confirmed identifiers and mode", () => {
    const run = createPendingAgentRunView({ ...identifiers, mode: "DEEP", startedAt: "2026-07-18T00:00:00.000Z" });
    expect(run).toMatchObject({
      id: identifiers.runId,
      conversationId: identifiers.conversationId,
      userMessageId: identifiers.userMessageId,
      assistantMessageId: identifiers.assistantMessageId,
      mode: "DEEP",
      status: "PENDING",
      phase: "PLANNING",
      plannedWorkerCount: 6,
      providerCallCount: 0,
    });
  });

  it("reduces plan, Worker, synthesis, and terminal events without invented detail", () => {
    let run = createPendingAgentRunView({ ...identifiers, mode: "STANDARD", startedAt: "2026-07-18T00:00:00.000Z" });
    run = reduceAgentStreamEvent(run, { event: "plan_ready", data: {
      overview: "安全计划",
      workers: [{ key: "risk", name: "风险 Worker", title: "风险审查", objective: "识别风险", expectedDeliverable: "风险清单", priority: "HIGH", dependsOn: [] }],
    } });
    expect(run).toMatchObject({ phase: "DISPATCHING", planOverview: "安全计划", providerCallCount: 1 });
    expect(run.workers[0]).toMatchObject({ key: "risk", status: "QUEUED", findings: [], structured: false });

    run = reduceAgentStreamEvent(run, { event: "worker_started", data: { workerKey: "risk" } });
    expect(run.workers[0].status).toBe("RUNNING");
    expect(run.providerCallCount).toBe(2);

    run = reduceAgentStreamEvent(run, { event: "worker_done", data: { workerKey: "risk", deliverable: {
      workSummary: "已完成审查", findings: ["发现"], assumptions: [], risks: ["风险"], recommendations: ["建议"], finalDeliverable: "交付", structured: true,
    } } });
    expect(run.workers[0]).toMatchObject({ status: "COMPLETE", workSummary: "已完成审查", finalDeliverable: "交付", structured: true });
    expect(run.successfulWorkerCount).toBe(1);

    run = reduceAgentStreamEvent(run, { event: "synthesis_started", data: {} });
    run = reduceAgentStreamEvent(run, { event: "synthesis_delta", data: { text: "最终" } });
    run = reduceAgentStreamEvent(run, { event: "done", data: {} });
    expect(run).toMatchObject({ status: "COMPLETE", phase: "FINISHED", providerCallCount: 3 });
    expect(run.assistantMessage).toMatchObject({ content: "最终", status: "COMPLETE" });
  });
});

describe("Agent compact status merge", () => {
  it("updates progress while retaining full deliverables already observed by SSE or detail fetch", () => {
    const planned = reduceAgentStreamEvent(createPendingAgentRunView({ ...identifiers, mode: "STANDARD" }), {
      event: "plan_ready",
      data: { overview: "Plan", workers: [{ key: "worker-a", name: "A", title: "Title", objective: "Objective", expectedDeliverable: "Expected", priority: "HIGH", dependsOn: [] }] },
    });
    const current = reduceAgentStreamEvent(planned, {
      event: "worker_done",
      data: { workerKey: "worker-a", deliverable: { finalDeliverable: "Keep me", findings: ["Finding"], structured: true } },
    });
    const merged = mergeAgentRunStatus(current, {
      id: identifiers.runId,
      conversationId: identifiers.conversationId,
      userMessageId: identifiers.userMessageId,
      assistantMessageId: identifiers.assistantMessageId,
      mode: "STANDARD",
      status: "COMPLETE",
      phase: "FINISHED",
      planOverview: "Plan",
      planFallback: false,
      plannedWorkerCount: 4,
      completedWorkerCount: 1,
      successfulWorkerCount: 1,
      providerCallCount: 3,
      errorCode: null,
      startedAt: current.startedAt,
      completedAt: current.startedAt,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      assistantMessage: { status: "COMPLETE", createdAt: current.createdAt },
      workers: [{
        key: "worker-a", position: 0, name: "A", title: "Title", objective: "Objective", expectedDeliverable: "Expected",
        priority: "HIGH", status: "COMPLETE", dependsOnKeys: [], errorCode: null,
        startedAt: current.startedAt, completedAt: current.startedAt, createdAt: current.createdAt, updatedAt: current.updatedAt,
      }],
    });
    expect(merged.workers[0]).toMatchObject({ status: "COMPLETE", finalDeliverable: "Keep me", findings: ["Finding"], structured: true });
    expect(merged.detailLevel).toBe("STATUS");
  });
});
