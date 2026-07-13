export type AiErrorCode =
  | "ABORTED"
  | "CONFIGURATION"
  | "AUTHENTICATION"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "EMPTY_RESPONSE"
  | "INVALID_REQUEST"
  | "UNKNOWN";

export interface AiProviderDiagnostics {
  providerErrorCode?: string;
  providerMessage?: string;
}

export class AiProviderError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly status?: number,
    public readonly diagnostics?: AiProviderDiagnostics,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export function toPublicAiError(error: unknown): string {
  if (!(error instanceof AiProviderError)) {
    return "AI 服务暂时不可用，请稍后重试。";
  }

  switch (error.code) {
    case "CONFIGURATION":
      return "AI 服务尚未配置完成，请联系管理员。";
    case "AUTHENTICATION":
      return "AI 服务认证失败，请联系管理员检查配置。";
    case "NOT_FOUND":
      return "AI 模型或接口地址不可用，请联系管理员检查配置。";
    case "RATE_LIMITED":
      return "AI 服务当前请求较多，请稍后再试。";
    case "TIMEOUT":
      return "AI 响应超时，请稍后重试。";
    case "INVALID_RESPONSE":
    case "EMPTY_RESPONSE":
      return "AI 返回了无效内容，请重新尝试。";
    case "INVALID_REQUEST":
      return "AI 请求格式暂时不兼容，请联系管理员检查配置。";
    case "UNAVAILABLE":
      return "AI 服务暂时不可用，请稍后重试。";
    case "ABORTED":
      return "已停止生成。";
    default:
      return "AI 服务发生错误，请稍后重试。";
  }
}
