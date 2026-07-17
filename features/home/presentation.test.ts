import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTimeGreeting } from "@/features/home/presentation";

describe("premium home presentation", () => {
  it("selects a greeting from the user's local hour", () => {
    expect(getTimeGreeting(3)).toBe("夜深了");
    expect(getTimeGreeting(9)).toBe("早上好");
    expect(getTimeGreeting(14)).toBe("下午好");
    expect(getTimeGreeting(21)).toBe("晚上好");
  });

  it("loads an owned latest conversation without inventing message counts", () => {
    const data = readFileSync("features/home/data.ts", "utf8");
    expect(data).toContain("prisma.conversation");
    expect(data).toContain("where: { userId: user.id }");
    expect(data).toContain('orderBy: { updatedAt: "desc" }');
    expect(data).toContain("persona: { select: { name: true } }");
    expect(data).not.toContain("messages:");
  });

  it("provides an honest empty state when no recent conversation exists", () => {
    const home = readFileSync(
      "features/home/components/home-dashboard.tsx",
      "utf8",
    );
    expect(home).toContain("还没有最近对话");
    expect(home).toContain("不使用任何虚构记录");
  });
});
