import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("new-chat assistant selector layout", () => {
  const layout = readFileSync(new URL("./components/chat-layout.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("./components/assistant-selector-panel.tsx", import.meta.url), "utf8");

  it("removes the old top horizontal selector and mounts the right panel only for a new conversation", () => {
    expect(layout).not.toContain('import { PersonaSelector }');
    expect(layout).toContain("!activeConversationId && <AssistantSelectorPanel");
    expect(panel).toContain("hidden w-[19rem] shrink-0");
    expect(panel).toContain("bg-background-subtle/82");
    expect(panel).toContain("overflow-y-auto");
  });

  it("offers the default assistant first, active personas, and mobile dialog controls", () => {
    expect(panel.indexOf("默认 AI 助手")).toBeLessThan(panel.indexOf("personas.map"));
    expect(panel).toContain('aria-current'); expect(panel).toContain('role="dialog"');
    expect(panel).toContain('href="/personas/new"'); expect(panel).toContain('href="/personas"');
  });

  it("uses local selection and native history replacement so the draft is not reset", () => {
    expect(layout).toContain("setActivePersona(persona)");
    expect(layout).toContain("window.history.replaceState");
    expect(layout).not.toContain("setDraft(\"\");\n    const nextUrl");
  });
});
