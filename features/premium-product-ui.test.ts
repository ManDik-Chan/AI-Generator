import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const chatLayout = source("features/chat/components/chat-layout.tsx");
const conversations = source("features/chat/components/conversation-list.tsx");
const composer = source("features/chat/components/chat-composer.tsx");
const message = source("features/chat/components/message-item.tsx");
const personaForm = source("features/persona/components/persona-form.tsx");
const personaCard = source("features/persona/components/persona-card.tsx");
const avatarDialog = source("features/persona/components/ai-avatar-dialog.tsx");
const memory = source("features/memory/components/memory-manager.tsx");
const tools = source("app/tools/page.tsx");
const toolRunner = source("features/tools/components/tool-runner.tsx");
const imageAnalyzer = source("features/tools/components/image-analyzer.tsx");
const history = source("features/tools/components/tool-history.tsx");
const globals = source("app/globals.css");

describe("full product premium UI contract", () => {
  it("keeps the real three-surface chat layout and mobile drawers", () => {
    expect(chatLayout).toContain("data-chat-shell");
    expect(chatLayout).toContain("<ConversationList");
    expect(chatLayout).toContain("<MessageList");
    expect(chatLayout).toContain("<AssistantSelectorPanel");
    expect(chatLayout).toContain("app-viewport");
    expect(chatLayout).toContain("setDrawerOpen(true)");
    expect(conversations).toContain('aria-current={conversation.id === activeId ? "page"');
  });

  it("preserves accessible composer send, stop, edit and keyboard behavior", () => {
    expect(composer).toContain('aria-label="发送消息"');
    expect(composer).toContain('props.stopping ? "正在请求停止" : "停止生成"');
    expect(composer).toContain("disabled={props.stopping}");
    expect(composer).toContain("!event.shiftKey");
    expect(message).toContain('aria-label={props.editDisabled ? "停止生成并编辑此消息"');
    expect(message).toContain('aria-label="提交编辑"');
  });

  it("provides persona studio cards, builder sections and mobile preview switching", () => {
    expect(personaCard).toContain("ACTIVE ASSISTANT");
    expect(personaCard).toContain("PersonaActionsMenu");
    expect(personaForm).toContain('mobileView === "preview"');
    expect(personaForm).toContain("01 · BASIC IDENTITY");
    expect(personaForm).toContain("04 · ADVANCED");
    expect(avatarDialog).toContain("AI AVATAR STUDIO");
    expect(avatarDialog).toContain('aria-modal="true"');
  });

  it("renders only real memory capacity, filters and semantic status", () => {
    expect(memory).toContain("{memories.length}");
    expect(memory).toContain("{maxTotal}");
    expect(memory).toContain("setQuery");
    expect(memory).toContain("setFiltersOpen");
    expect(memory).toContain("semanticIndex.indexed");
    expect(memory).toContain("indexedIds.has(memory.id)");
    expect(memory).not.toContain("主题：{memory.topicKey}");
  });

  it("maps every implemented tool and history action without invented capabilities", () => {
    expect(tools).toContain('type: "SUMMARIZE"');
    expect(tools).toContain('type: "REWRITE"');
    expect(tools).toContain('type: "TRANSLATE"');
    expect(tools).toContain('href="/tools/image"');
    expect(tools).not.toMatch(/PDF|OCR|RAG/);
    expect(toolRunner).toContain("STREAMING RESULT");
    expect(imageAnalyzer).toContain("PRIVATE UPLOAD");
    expect(history).toContain("再次分析");
    expect(history).toContain("原图片已到期清理");
  });

  it("keeps privacy switches, quota state and partial-result actions visible", () => {
    expect(toolRunner).toContain("保存到工具历史");
    expect(toolRunner).toContain("停止生成");
    expect(imageAnalyzer).toContain("formatVisionUsage(usage)");
    expect(imageAnalyzer).toContain("停止分析");
    expect(imageAnalyzer).toContain("部分结果已保留");
    expect(history).toContain("复制结果");
    expect(history).toContain("downloadResult");
  });

  it("uses the approved light and dark premium tokens across all surfaces", () => {
    for (const token of ["42 31% 94%", "213 21% 10%", "164 77% 30%", "192 14% 7%", "162 54% 50%", "--radius-card: 1.375rem", "--radius-display: 2.125rem"]) {
      expect(globals).toContain(token);
    }
    expect(globals).toContain("prefers-reduced-motion");
    expect(globals).toContain("env(safe-area-inset-bottom, 0px)");
  });

  it("removes the former admin-card visual language and prototype fake data", () => {
    const migrated = [chatLayout, conversations, composer, message, personaForm, personaCard, memory, tools, toolRunner, imageAnalyzer, history].join("\n");
    expect(migrated).not.toContain("bg-card");
    expect(migrated).not.toContain("ManDik");
    expect(migrated).not.toContain("18 条消息");
    expect(migrated).not.toContain("网页分析");
    expect(migrated).not.toContain("自定义首页");
  });
});
