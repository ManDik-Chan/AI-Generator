import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = readFileSync("package.json", "utf8");
const workflow = readFileSync(
  ".github/workflows/security-acceptance.yml",
  "utf8",
);
const e2e = readFileSync(
  "tests/e2e/mobile/memory-proposals.spec.ts",
  "utf8",
);
const mockProvider = readFileSync(
  "tests/e2e/mock-ai-provider.mjs",
  "utf8",
);
const playwrightConfig = readFileSync("playwright.config.ts", "utf8");
const artifactSanitizer = readFileSync(
  "scripts/redact-e2e-artifacts.mjs",
  "utf8",
);
const migrationVerifier = readFileSync(
  "scripts/verify-security-migrations.mjs",
  "utf8",
);

describe("Proposal Security Acceptance wiring", () => {
  it("runs the real Proposal production-transaction suite fail-closed", () => {
    expect(packageJson).toContain(
      "tests/integration/memory-proposals.integration.test.ts",
    );
    expect(workflow).toContain('REQUIRE_SECURITY_TEST_DATABASE: "true"');
    expect(workflow).toContain(
      "tests/integration/memory-proposals.integration.test.ts",
    );
    expect(workflow).toContain("pnpm exec prisma migrate deploy");
    expect(workflow).toContain("node scripts/verify-security-migrations.mjs clean");
    expect(workflow).toContain("node scripts/verify-security-migrations.mjs incremental");
    expect(migrationVerifier).toContain("deploy(old.schema)");
    expect(migrationVerifier).toContain("deploy(base.schema)");
    expect(migrationVerifier).not.toContain('"migrate", "reset"');
  });

  it("uses a deterministic provider through the real chat route", () => {
    expect(workflow).toContain("AI_BASE_URL=http://127.0.0.1:4319/v1");
    expect(mockProvider).toContain("/chat/completions");
    expect(mockProvider).toContain("你是长期记忆提取器");
    expect(mockProvider).toContain("/embeddings");
    expect(e2e).toContain("sendChatAndWaitForCompletion(");
    expect(e2e).toContain("waitForAssistantMessageStatus");
    expect(e2e).toContain("memoryProposal.count");
    expect(e2e).toContain("memoryEmbedding.count");
    expect(e2e).toContain("E2E_IMPLICIT");
    expect(e2e).toContain("E2E_UPDATE");
    expect(e2e).toContain("E2E_EDIT");
    expect(e2e).toContain("E2E_REJECT");
    expect(e2e).toContain("E2E_CONFLICT");
    expect(e2e).toContain("E2E_EXPIRED");
    expect(e2e).toContain("E2E_DISABLED");
    expect(e2e).toContain("E2E_EXPLICIT");
    expect(e2e).toContain("E2E_SOURCE");
    expect(e2e).toContain("E2E_RESUBMIT");
    expect(e2e).toContain("CANCELLED");
  });

  it("keeps the requested responsive matrix executable", () => {
    expect(e2e).toContain("[390, 430, 768, 1440]");
    expect(e2e).toContain("expectNoHorizontalOverflow");
  });

  it("isolates each authenticated browser project and retains sanitized diagnostics", () => {
    expect(workflow).toContain("authenticated-browser-acceptance:");
    expect(workflow).toContain("project: chromium-desktop");
    expect(workflow).toContain("project: chromium-mobile");
    expect(workflow).toContain("project: webkit-iphone");
    expect(workflow).toContain("Start project-isolated local Supabase");
    expect(workflow).toContain("node scripts/verify-e2e-readiness.mjs");
    expect(workflow).toContain("node scripts/redact-e2e-artifacts.mjs");
    expect(workflow).toContain("if: always() && steps.sanitize.outcome == 'success'");
    expect(workflow).toContain("retention-days: 7");
    expect(playwrightConfig).toContain("retries: 0");
    expect(artifactSanitizer).toContain("playwrightReportBase64");
    expect(artifactSanitizer).toContain("sanitizeZip(archivePath)");
  });
});
