import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatElapsedTime } from "@/components/ai/use-elapsed-time";

describe("shared generation progress", () => {
  it("formats elapsed time without inventing a percentage", () => { expect(formatElapsedTime(18)).toBe("已用时 18 秒"); expect(formatElapsedTime(72)).toBe("已用时 1 分 12 秒"); const source = readFileSync(new URL("./generation-progress.tsx", import.meta.url), "utf8"); expect(source).toContain('role="status"'); expect(source).toContain('aria-live="polite"'); expect(source).not.toMatch(/percent|百分比|%/i); });
});
