import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Phase 6B2.1 performance and scrolling contracts", () => {
  it("never moves the document when the Chat composer receives focus", () => {
    const composer = read("features/chat/components/chat-composer.tsx");
    const dialog = read("components/ui/dialog.tsx");
    expect(composer).not.toContain("scrollIntoView");
    expect(composer).not.toContain("onFocus=");
    expect(dialog).not.toContain("window.scrollTo");
  });

  it("limits VisualViewport layout writes to mobile resize events", () => {
    const hook = read("features/mobile/use-visual-viewport.ts");
    expect(hook).toContain('MOBILE_LAYOUT_QUERY = "(max-width: 820px)"');
    expect(hook).toContain("handleViewportResize");
    expect(hook).toContain("handleViewportScroll");
    expect(hook).toContain("schedule(false)");
    expect(hook).toContain("Math.abs(current - next) < 1");
    expect(hook).toContain("document.activeElement");
    expect(hook).not.toContain("useState");
  });

  it("splits ordinary document scrolling from fixed viewport workspaces", () => {
    const shell = read("components/layout/app-shell.tsx");
    const css = read("app/globals.css");
    const chat = read("features/chat/components/chat-layout.tsx");
    expect(shell).toContain('scrollMode = "document"');
    expect(shell).toContain("data-scroll-mode={scrollMode}");
    expect(css).toContain('.app-shell-root[data-scroll-mode="document"]');
    expect(css).toContain('.app-shell-root[data-scroll-mode="viewport"]');
    expect(chat).toContain("app-viewport");
  });

  it("uses fluid desktop widths instead of the old poster width", () => {
    const variants = read("components/layout/layout-variants.ts");
    const shell = read("components/layout/app-shell.tsx");
    expect(variants).toContain('reading: "max-w-[52rem]"');
    expect(variants).toContain('standard: "max-w-[84rem]"');
    expect(variants).toContain('wide: "max-w-[100rem]"');
    expect(variants).not.toContain("77.75rem");
    expect(shell).toContain("clamp(1.5rem,3vw,3rem)");
  });

  it("renders the home body on the server without Framer Motion", () => {
    const home = read("features/home/components/home-dashboard.tsx");
    const page = read("app/page.tsx");
    expect(home).not.toContain('"use client"');
    expect(home).not.toContain("framer-motion");
    expect(home).toContain("让你的 AI");
    expect(home).toContain("Suspense");
    expect(page).toContain("<HomeDashboard />");
  });

  it("deduplicates request auth and streams personalized home data", () => {
    expect(read("lib/auth/session.ts")).toContain("cache(readCurrentUser)");
    expect(read("components/layout/shell-viewer-data.ts")).toContain("cache(async");
    const data = read("features/home/data.ts");
    expect(data).toContain("Promise.all");
    expect(data).toContain("getShellViewer()");
    expect(data).toContain("getHomePersonalization = cache");
  });

  it("disables automatic prefetch for growing dynamic lists", () => {
    const conversations = read("features/chat/components/conversation-list.tsx");
    const personas = read("features/persona/components/persona-card.tsx");
    const memories = read("features/memory/components/memory-manager.tsx");
    expect(conversations).toContain("prefetch={false}");
    expect(personas.match(/prefetch=\{false\}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(memories).toContain("prefetch={false}");
  });

  it("provides immediate navigation feedback without an artificial delay", () => {
    const feedback = read("components/layout/navigation-feedback.tsx");
    const layout = read("app/layout.tsx");
    expect(feedback).toContain('document.addEventListener("click"');
    expect(feedback).toContain("正在打开页面");
    expect(feedback).not.toContain("setTimeout");
    expect(layout).toContain("<NavigationFeedback />");
  });
});
