const credentialPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bsb_secret_[A-Za-z0-9_-]{12,}\b/i,
  /\bBearer\s+[A-Za-z0-9._~-]{20,}\b/i,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b(?:api[_ -]?key|access[_ -]?token|secret[_ -]?key)\s*[:=]\s*["']?[A-Za-z0-9_./+~-]{16,}/i,
  /\b(?:postgres(?:ql)?|mysql|mongodb):\/\/[^\s:@]+:[^\s@]+@/i,
];
export function containsHighConfidenceCredential(content: string) { return credentialPatterns.some((pattern) => pattern.test(content)); }
export function normalizeMemoryContent(content: string) { return content.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"); }
