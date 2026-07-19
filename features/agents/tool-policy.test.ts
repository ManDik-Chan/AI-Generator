import { describe, expect, it } from "vitest";

import {
  AGENT_WORKER_TOOL_POLICY,
  AgentToolPolicyError,
  assertAgentWorkerCapability,
  assertAgentWorkerTool,
} from "@/features/agents/tool-policy";

describe("Agent Worker Tool Policy", () => {
  it("allows reasoning and exposes no tools", () => {
    expect(AGENT_WORKER_TOOL_POLICY.allowedCapabilities).toEqual(["REASONING"]);
    expect(AGENT_WORKER_TOOL_POLICY.allowedTools).toEqual([]);
    expect(() => assertAgentWorkerCapability("REASONING")).not.toThrow();
  });

  it.each(["WEB_SEARCH", "FILE_READ", "FILE_WRITE", "CODE_EXECUTION", "GIT_READ", "GIT_WRITE", "BROWSER", "MCP"] as const)(
    "denies %s on the server",
    (capability) => expect(() => assertAgentWorkerCapability(capability)).toThrow(AgentToolPolicyError),
  );

  it("denies every named tool", () => {
    expect(() => assertAgentWorkerTool("shell.exec")).toThrow(AgentToolPolicyError);
  });
});
