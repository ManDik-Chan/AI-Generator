import { describe, expect, it } from "vitest";
import { getComposerDisabledReason, getComposerPlaceholder } from "@/features/chat/composer-state";

describe("chat composer disabled reasons", () => {
  it("shows the normal prompt when AI is configured and no edit is active", () => {
    expect(getComposerDisabledReason(true, false)).toBeUndefined();
    expect(getComposerPlaceholder(getComposerDisabledReason(true, false))).toContain("输入消息");
  });

  it("shows the AI configuration prompt only when AI is actually unavailable", () => {
    expect(getComposerPlaceholder(getComposerDisabledReason(false, false))).toBe("AI 服务尚未配置");
  });

  it("shows an editing prompt without reporting an AI configuration problem", () => {
    const placeholder = getComposerPlaceholder(getComposerDisabledReason(true, true));
    expect(placeholder).toBe("正在编辑上一条消息");
    expect(placeholder).not.toContain("AI 服务尚未配置");
  });

  it("returns to normal after cancel and stays in editing mode after a failed edit", () => {
    expect(getComposerDisabledReason(true, false)).toBeUndefined();
    expect(getComposerDisabledReason(true, true)).toBe("editing");
  });

  it("disables an existing deleted-persona conversation with a recovery prompt", () => {
    const reason = getComposerDisabledReason(true, false, true);
    expect(reason).toBe("persona-deleted");
    expect(getComposerPlaceholder(reason)).toBe("恢复人格后可以继续对话");
  });
});
