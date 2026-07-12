import { describe, expect, it, vi } from "vitest";
import { ImageProviderError, logImageSafetyDiagnostic, toPublicImageError } from "@/lib/ai/image/errors";

describe("image safety error exposure", () => {
  it.each([
    ["content-type", "图片 CDN 返回类型异常。"], ["redirect", "图片重定向异常。"],
    ["content-length", "图片超过大小限制。"], ["image-signature", "图片文件格式异常。"],
  ] as const)("maps %s to a safe browser message", (stage, message) => {
    const error = new ImageProviderError("UNSAFE_IMAGE", "internal", undefined, { stage, hostname: "cdn.example", status: 418 });
    expect(toPublicImageError(error)).toBe(message); expect(toPublicImageError(error)).not.toContain("cdn.example");
  });

  it("returns a dedicated proxy DNS message without an address", () => {
    const error = new ImageProviderError("PROXY_DNS", "internal", undefined, { stage: "dns", hostname: "cdn.example", resolvedAddressClass: "fake-ip-or-private" });
    expect(toPublicImageError(error)).toBe("图片下载地址被本机代理解析为保留地址，请调整代理 DNS/TUN 模式后重试。");
  });

  it("logs only the diagnostics whitelist, never the internal error message", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = new ImageProviderError("UNSAFE_IMAGE", "https://cdn.example/a?token=secret", undefined, { stage: "content-type", hostname: "cdn.example", declaredType: "text/html" });
    logImageSafetyDiagnostic(error); const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("cdn.example"); expect(logged).not.toContain("token="); expect(logged).not.toContain("secret"); expect(logged).not.toContain("https://");
  });
});
