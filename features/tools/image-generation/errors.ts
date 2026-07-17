import { ImageProviderError } from "@/lib/ai/image/errors";

export function toPublicToolImageError(error: unknown) {
  if (!(error instanceof ImageProviderError)) {
    return { code: "UNAVAILABLE", message: "图片生成失败，请稍后重试。" };
  }
  const messages = {
    CONFIGURATION: "图片生成服务尚未配置，请联系管理员。",
    AUTHENTICATION: "图片服务认证失败，请联系管理员检查配置。",
    RATE_LIMITED: "图片生成请求过于频繁，请稍后重试。",
    NOT_FOUND: "图片模型或接口不存在，请联系管理员。",
    TIMEOUT: "图片生成或下载超时，请稍后重试。",
    ABORTED: "图片生成已停止。",
    UNAVAILABLE: "图片生成服务暂时不可用，请稍后重试。",
    INVALID_RESPONSE: "图片服务返回了无效结果。",
    UNSAFE_IMAGE: "生成图片未通过安全校验。",
    PROXY_DNS: "图片下载地址被代理解析为保留地址，请调整代理后重试。",
    STORAGE: "图片暂时无法保存到私有空间，请稍后重试。",
  } as const;
  return { code: error.code, message: messages[error.code] };
}
