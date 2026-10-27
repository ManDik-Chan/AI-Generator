/** Only return to existing platform route families, never a supplied origin. */
export const platformPrefixes = ["/workspace", "/account", "/admin", "/chat", "/memories", "/personas", "/settings", "/tools", "/agents"] as const;

export function isPlatformPath(pathname: string) {
  return platformPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/workspace";
  try {
    // Encoded separators/dot segments can be interpreted differently by proxies and browsers.
    const path = value.split(/[?#]/, 1)[0];
    if (/%(?:2f|5c|2e|25)/i.test(path)) return "/workspace";
    const parsed = new URL(value, "https://return.invalid");
    if (parsed.origin !== "https://return.invalid" || !isPlatformPath(parsed.pathname)) return "/workspace";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/workspace";
  }
}
