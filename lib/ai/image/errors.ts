export type ImageErrorCode = "CONFIGURATION" | "AUTHENTICATION" | "NOT_FOUND" | "RATE_LIMITED" | "UNAVAILABLE" | "TIMEOUT" | "ABORTED" | "INVALID_RESPONSE" | "UNSAFE_IMAGE" | "PROXY_DNS" | "STORAGE";

export type ImageSafetyStage = "url" | "dns" | "redirect" | "http-status" | "content-length" | "content-type" | "image-signature" | "mime-mismatch";

export interface ImageSafetyDiagnostics {
  stage: ImageSafetyStage;
  hostname?: string;
  status?: number;
  redirectCount?: number;
  declaredType?: string;
  detectedType?: string;
  declaredLength?: number;
  downloadedLength?: number;
  resolvedAddressClass?: "fake-ip-or-private";
}

export class ImageProviderError extends Error {
  constructor(public code: ImageErrorCode, message: string, public status?: number, public diagnostics?: ImageSafetyDiagnostics) {
    super(message);
    this.name = "ImageProviderError";
  }
}

export function logImageSafetyDiagnostic(error: unknown) {
  if (!(error instanceof ImageProviderError) || !error.diagnostics) return;
  console.warn("Persona avatar download rejected", error.diagnostics);
}

export function toPublicImageError(error: unknown) {
  if (!(error instanceof ImageProviderError)) return "头像生成失败，请稍后重试。";
  if (error.code === "PROXY_DNS") return "图片下载地址被本机代理解析为保留地址，请调整代理 DNS/TUN 模式后重试。";
  if (error.code === "UNSAFE_IMAGE") {
    if (error.diagnostics?.stage === "content-type") return "图片 CDN 返回类型异常。";
    if (error.diagnostics?.stage === "redirect") return "图片重定向异常。";
    if (error.diagnostics?.stage === "content-length") return "图片超过大小限制。";
    if (error.diagnostics?.stage === "image-signature" || error.diagnostics?.stage === "mime-mismatch") return "图片文件格式异常。";
  }
  const map: Record<ImageErrorCode, string> = {
    CONFIGURATION: "GLM-Image 头像生成服务尚未配置。",
    AUTHENTICATION: "图片服务认证失败，请检查配置。",
    NOT_FOUND: "图片模型或接口不存在。",
    RATE_LIMITED: "图片生成请求过于频繁，请稍后重试。",
    UNAVAILABLE: "图片下载失败，请稍后重试。",
    TIMEOUT: "头像生成或下载超时。",
    ABORTED: "头像生成已取消，当前头像未发生变化。",
    INVALID_RESPONSE: "图片服务返回了无效结果。",
    UNSAFE_IMAGE: "生成图片未通过安全校验。",
    PROXY_DNS: "图片下载地址被本机代理解析为保留地址，请调整代理 DNS/TUN 模式后重试。",
    STORAGE: "Supabase 头像存储尚未配置或保存失败。",
  };
  return map[error.code];
}
