import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/tools/run/route.ts", "utf8");
const runner = readFileSync("features/tools/components/tool-runner.tsx", "utf8");
const queries = readFileSync("features/tools/queries.ts", "utf8");
describe("tool integration boundaries", () => {
  it("calls the shared provider once with system + user and disabled thinking", () => { expect(route.match(/provider\.streamText\(/g)).toHaveLength(1); expect(route).toContain('role: "system"'); expect(route).toContain('role: "user"'); expect(route).toContain('thinking: "disabled"'); });
  it("does not create chat or memory records", () => { expect(route).not.toMatch(/prisma\.(conversation|message|memory)\./); expect(route).not.toContain("retrieveRelevantMemories"); });
  it("protects terminal state against late completion", () => expect(readFileSync("features/tools/usage.ts", "utf8")).toContain('status: "PENDING"'));
  it("keeps private runs out of ordinary history", () => expect(queries).toContain("retainContent: true"));
  it("stops without router.refresh and preserves partial output", () => { const stopBody = runner.match(/async function stop\(\)[\s\S]*?\n  }/)?.[0] ?? ""; expect(stopBody).toContain("controllerRef.current?.abort()"); expect(stopBody).toContain("setState(\"stopped\")"); expect(stopBody).not.toContain("setOutput"); expect(runner).not.toContain("router.refresh"); });
  it("downloads TXT and Markdown in the browser", () => { expect(runner).toContain('download("txt")'); expect(runner).toContain('download("md")'); expect(runner).toContain("URL.createObjectURL"); });
});
