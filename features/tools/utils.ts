import type { ToolTypeValue } from "@/features/tools/types";
import { TOOL_LABELS } from "@/features/tools/constants";
import { AiProviderError } from "@/lib/ai/errors";

export function escapeToolXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function createToolRunTitle(tool: ToolTypeValue, input: string) {
  const compact = input.replace(/\s+/g, " ").trim();
  return `${TOOL_LABELS[tool]}：${compact}`.slice(0, 100);
}

export function startOfUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function encodeToolSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function toolErrorCode(error: unknown) {
  if (!(error instanceof AiProviderError)) return "UNKNOWN";
  if (error.code === "ABORTED") return "CANCELLED";
  if (error.code === "UNAVAILABLE" || error.code === "INVALID_REQUEST" || error.code === "NOT_FOUND") return "PROVIDER_ERROR";
  return error.code;
}

export function publicToolError(error: unknown) {
  const code = toolErrorCode(error);
  const messages: Record<string, string> = {
    CONFIGURATION: "AI 工具服务尚未配置，请联系管理员。",
    AUTHENTICATION: "AI 工具服务认证失败，请联系管理员检查配置。",
    RATE_LIMITED: "AI 服务当前请求较多，请稍后重试。",
    TIMEOUT: "处理超时，请稍后重试或缩短输入文本。",
    EMPTY_RESPONSE: "AI 没有返回有效内容，请重试。",
    CANCELLED: "已停止生成。",
    PROVIDER_ERROR: "AI 工具服务暂时不可用，请稍后重试。",
    UNKNOWN: "处理失败，请稍后重试。",
  };
  return { code, message: messages[code] ?? messages.UNKNOWN };
}

export function previewText(value: string | null, maximum = 160) {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maximum ? `${compact.slice(0, maximum)}…` : compact;
}
