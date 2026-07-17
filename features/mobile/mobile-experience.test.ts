import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Phase 6B2 mobile experience contracts", () => {
  it("keeps zoom enabled and a device-width viewport", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain('width: "device-width"');
    expect(layout).toContain("initialScale: 1");
    expect(layout).not.toContain("userScalable");
    expect(layout).not.toContain("maximumScale");
  });

  it("defines dvh/svh fallbacks and every shared safe-area token", () => {
    const css = read("app/globals.css");
    expect(css).toContain("--app-height: 100vh");
    expect(css).toContain("--app-height: 100svh");
    expect(css).toContain("--app-height: 100dvh");
    for (const token of ["--visual-viewport-height", "--safe-area-top", "--safe-area-right", "--safe-area-bottom", "--safe-area-left", "--mobile-header-height", "--mobile-nav-height", "--composer-height"]) expect(css).toContain(token);
    expect(css).not.toMatch(/body\s*\{[\s\S]*?overflow-x:\s*hidden/);
  });

  it("uses a mobile scroll region and document scrolling on ordinary desktop pages", () => {
    const shell = read("components/layout/app-shell.tsx");
    const css = read("app/globals.css");
    expect(shell).toContain("app-shell-root");
    expect(shell).toContain('scrollMode = "document"');
    expect(shell).toContain("data-app-scroll-region");
    expect(shell).toContain("mobile-scroll-region");
    expect(shell).toContain("var(--mobile-nav-height)");
    expect(css).toContain('.app-shell-root[data-scroll-mode="document"]');
    expect(css).toContain("overflow: visible");
  });

  it("updates VisualViewport through requestAnimationFrame and cleans every listener", () => {
    const hook = read("features/mobile/use-visual-viewport.ts");
    expect(hook).toContain("requestAnimationFrame");
    expect(hook).toContain('matchMedia(MOBILE_LAYOUT_QUERY)');
    expect(hook).toContain('document.visibilityState === "hidden"');
    expect(hook).toContain('addEventListener("resize"');
    expect(hook).toContain('addEventListener("scroll"');
    expect(hook).toContain('removeEventListener("resize"');
    expect(hook).toContain('removeEventListener("scroll"');
    expect(hook).toContain("cancelAnimationFrame");
    expect(hook).toContain("Math.abs(current - next) < 1");
    expect(hook).toContain("isEditableTarget(document.activeElement)");
  });

  it("uses 16px mobile fields without disabling browser zoom", () => {
    const css = read("app/globals.css");
    expect(css).toContain('[contenteditable="true"] { font-size: 16px !important; }');
    expect(css).not.toContain("user-scalable=no");
  });

  it("keeps Chat as one message scroller with a growing bounded composer", () => {
    const list = read("features/chat/components/message-list.tsx");
    const composer = read("features/chat/components/chat-composer.tsx");
    const chat = read("features/chat/components/chat-layout.tsx");
    expect(chat).toContain("app-viewport");
    expect(list).toContain("data-chat-message-scroll");
    expect(list).toContain("回到底部");
    expect(composer).toContain("ResizeObserver");
    expect(composer).toContain("max-h-[min(10rem,35dvh)]");
    expect(composer).toContain("text-base");
    expect(composer).not.toContain("scrollIntoView");
    expect(chat).not.toContain("controller?.abort(); }, []");
  });

  it("keeps long Markdown inside its own content boundary", () => {
    const markdown = read("features/chat/components/markdown-message.tsx");
    const code = read("features/chat/components/code-block.tsx");
    const css = read("app/globals.css");
    expect(markdown).toContain("overflow-wrap-anywhere");
    expect(markdown).toContain("overflow-x-auto");
    expect(code).toContain("overflow-x-auto");
    expect(css).toContain("img, video, canvas, svg { max-width: 100%; }");
  });

  it("uses mobile sheets and collision-aware portal menus", () => {
    const dialog = read("components/ui/dialog.tsx");
    const dropdown = read("components/ui/dropdown.tsx");
    expect(dialog).toContain("data-dialog-panel");
    expect(dialog).toContain("overflow-y-auto");
    expect(dialog).toContain("lockDocumentScroll");
    expect(dropdown).toContain("createPortal");
    expect(read("components/ui/dropdown-position.ts")).toContain("DROPDOWN_COLLISION_PADDING = 12");
    expect(dropdown).toContain("window.visualViewport");
  });

  it("retains reduced motion, theme tokens, and 44px touch targets", () => {
    const css = read("app/globals.css");
    const navigation = read("components/layout/mobile-navigation.tsx");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".dark");
    expect(navigation).toContain("min-h-11");
    expect(navigation).toContain("size-11");
  });
});
