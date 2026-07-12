export type ComposerDisabledReason = "ai-not-configured" | "editing" | undefined;

export function getComposerDisabledReason(aiConfigured: boolean, editing: boolean): ComposerDisabledReason {
  if (!aiConfigured) return "ai-not-configured";
  if (editing) return "editing";
  return undefined;
}

export function getComposerPlaceholder(reason: ComposerDisabledReason) {
  if (reason === "ai-not-configured") return "AI 服务尚未配置";
  if (reason === "editing") return "正在编辑上一条消息";
  return "输入消息，Enter 发送，Shift + Enter 换行";
}
