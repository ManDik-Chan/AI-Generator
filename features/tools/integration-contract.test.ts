import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/tools/run/route.ts", "utf8");
const runner = readFileSync("features/tools/components/tool-runner.tsx", "utf8");
const queries = readFileSync("features/tools/queries.ts", "utf8");
describe("tool integration boundaries", () => {
  it("calls the shared provider once with system + user and disabled thinking", () => { expect(route.match(/provider\.streamText\(/g)).toHaveLength(1); expect(route).toContain('role: "system"'); expect(route).toContain('role: "user"'); expect(route).toContain('thinking: "disabled"'); });
  it("buffers provider output through the defensive guard before SSE", () => { expect(route).toContain("outputGuard.push(text)"); expect(route).toContain('stage: unsafe ? "output_guard"'); expect(route).toContain('errorCode: unsafe ? "UNSAFE_OUTPUT"'); });
  it("does not create chat or memory records", () => { expect(route).not.toMatch(/prisma\.(conversation|message|memory)\./); expect(route).not.toContain("retrieveRelevantMemories"); });
  it("protects terminal state against late completion", () => expect(readFileSync("features/tools/usage.ts", "utf8")).toContain('status: "PENDING"'));
  it("keeps private runs out of ordinary history", () => expect(queries).toContain("retainContent: true"));
  it("confirms durable cancellation before stopping and preserves partial output", () => {
    const confirmBody = runner.match(/async function confirmStop\([\s\S]*?\n  }/)?.[0] ?? "";
    const stopBody = runner.match(/async function stop\(\)[\s\S]*?\n  }/)?.[0] ?? "";
    expect(confirmBody).toContain("requestDurableCancellation");
    expect(confirmBody).toContain('status === "CANCELLED"');
    expect(confirmBody).toContain("controllerRef.current?.abort()");
    expect(confirmBody).toContain('setState("stopped")');
    expect(confirmBody).toContain("停止请求未确认，任务可能仍在后台处理。");
    expect(confirmBody).not.toContain("setOutput");
    expect(stopBody).toContain("pendingCancelRef.current = true");
    expect(stopBody).not.toContain("controllerRef.current?.abort()");
    expect(stopBody).not.toContain('setState("stopped")');
    expect(runner).not.toContain("router.refresh");
  });
  it("downloads TXT and Markdown in the browser", () => { expect(runner).toContain('download("txt")'); expect(runner).toContain('download("md")'); expect(runner).toContain("URL.createObjectURL"); });
});
