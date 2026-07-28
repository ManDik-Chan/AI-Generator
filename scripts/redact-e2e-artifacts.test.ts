import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("authenticated E2E artifact redaction", () => {
  it("redacts Supabase session wrappers as well as explicit sensitive values", () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "e2e-redaction-test-"));
    const sensitiveValuesPath = join(temporaryDirectory, "sensitive-values.txt");
    const artifactPath = join(temporaryDirectory, "extensionless-playwright-resource");
    const wrappedSession = "base64-eyJhY2Nlc3NfdG9rZW4iOiJsb2NhbC10ZXN0LXRva2VuIn0=";
    try {
      writeFileSync(sensitiveValuesPath, "fixture-secret\n", "utf8");
      writeFileSync(
        artifactPath,
        [
          `Cookie: sb-local-auth-token=${wrappedSession}`,
          "Authorization: Bearer opaque-provider-token",
          "https://127.0.0.1/callback?access_token=opaque-query-token",
          "password=fixture-secret",
        ].join("\n"),
        "utf8",
      );

      execFileSync(
        process.execPath,
        ["scripts/redact-e2e-artifacts.mjs", temporaryDirectory, sensitiveValuesPath],
        { cwd: process.cwd(), stdio: "pipe" },
      );

      const sanitized = readFileSync(artifactPath, "utf8");
      expect(sanitized).not.toContain(wrappedSession);
      expect(sanitized).not.toContain("fixture-secret");
      expect(sanitized).not.toContain("opaque-provider-token");
      expect(sanitized).not.toContain("opaque-query-token");
      expect(sanitized).toContain("[REDACTED]");
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
