import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("controlled persona avatar dialog UX", () => {
  const header = readFileSync(new URL("./components/persona-header-client.tsx", import.meta.url), "utf8");
  const dialog = readFileSync(new URL("./components/ai-avatar-dialog.tsx", import.meta.url), "utf8");
  const menu = readFileSync(new URL("./components/persona-actions-menu.tsx", import.meta.url), "utf8");
  const applyRoute = readFileSync(new URL("../../app/api/personas/[personaId]/avatar/apply/route.ts", import.meta.url), "utf8");

  it("shows a direct AI avatar action and keeps the dialog outside the conditional menu", () => { expect(header).toContain("AI 生成头像"); expect(header).toContain("<AiAvatarDialog"); expect(menu).not.toContain("AiAvatarDialog"); expect(menu).not.toContain("AI 生成头像"); });
  it("uses a controlled stable dialog with Escape and unmount abort cleanup", () => { expect(dialog).toContain("open: boolean"); expect(dialog).toContain("onOpenChange(open: boolean)"); expect(dialog).toContain('event.key === "Escape"'); expect(dialog).toContain("controllerRef.current?.abort()"); expect(dialog).not.toContain("setTimeout"); });
  it("applies the cache-busted URL locally without router.refresh", () => { expect(applyRoute).toContain("...applied"); expect(header).toContain("setAvatarUrl(next)"); expect(header).toContain("头像已更新"); expect(header).not.toContain("router.refresh"); expect(dialog).toContain("onApplied(body.avatarUrl)"); });
  it("keeps a previous candidate when regeneration or apply fails", () => { expect(dialog).toContain("const previous = candidate"); expect(dialog.indexOf("setCandidate(next)")).toBeLessThan(dialog.indexOf("await discard(previous)")); expect(dialog).not.toContain("setCandidate(undefined); throw"); });
});
