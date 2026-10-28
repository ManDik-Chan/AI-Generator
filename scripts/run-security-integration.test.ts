import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverIntegrationFiles, requireIsolatedEnvironment, verifyIntegrationReport } from "./run-security-integration.mjs";

describe("complete real integration acceptance runner", () => {
  it("discovers existing and future nested suites without a hand-maintained list", () => {
    const root = mkdtempSync(join(tmpdir(), "aig-integration-discovery-"));
    try {
      mkdirSync(join(root, "tests/integration/nested"), { recursive: true });
      writeFileSync(join(root, "tests/integration/memory-verification.integration.test.ts"), "");
      writeFileSync(join(root, "tests/integration/nested/future.integration.test.ts"), "");
      writeFileSync(join(root, "tests/integration/nested/new-format.test.ts"), "");
      writeFileSync(join(root, "tests/integration/helper.ts"), "");
      expect(discoverIntegrationFiles(root)).toEqual([
        "tests/integration/memory-verification.integration.test.ts", "tests/integration/nested/future.integration.test.ts", "tests/integration/nested/new-format.test.ts",
      ]);
    } finally {
      if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("aig-integration-discovery-")) throw new Error("Unsafe temporary cleanup target");
      rmSync(root, { recursive: true, force: true });
    }
  });

  const root = process.cwd();
  const expected = ["tests/integration/example.integration.test.ts"];
  const passed = () => ({ success: true, numTotalTests: 1, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    testResults: [{ name: join(root, expected[0]), status: "passed", assertionResults: [{ status: "passed" }] }] });

  it("accepts only actually executed complete reports", () => {
    expect(verifyIntegrationReport(root, expected, passed())).toEqual({ suites: 1, tests: 1 });
  });
  it("rejects an omitted suite even when the process report is green", () => {
    expect(() => verifyIntegrationReport(root, [...expected, "tests/integration/omitted.integration.test.ts"], passed())).toThrow("mismatch");
  });
  it("rejects a green report whose assertion count does not match its total", () => {
    const report = passed(); report.numTotalTests = 2;
    expect(() => verifyIntegrationReport(root, expected, report)).toThrow("count");
  });
  it.each(["skipped", "pending", "todo", "failed"])("rejects an unexpected %s assertion", (status) => {
    const report = passed(); report.testResults[0].assertionResults[0].status = status;
    expect(() => verifyIntegrationReport(root, expected, report)).toThrow();
  });
  it("fails closed before execution when the isolated environment is absent", () => {
    expect(() => requireIsolatedEnvironment({})).toThrow("disposable");
  });
  it("refuses remote endpoints even with safety flags", () => {
    expect(() => requireIsolatedEnvironment({ TEST_DATABASE_URL: "postgresql://test:fixture@remote.invalid/test", DATABASE_URL: "postgresql://test:fixture@remote.invalid/test",
      SUPABASE_TEST_URL: "https://remote.invalid", SUPABASE_TEST_ANON_KEY: "fixture", SUPABASE_TEST_SERVICE_ROLE_KEY: "fixture",
      ALLOW_TEST_DATABASE_MUTATIONS: "true", TEST_DATABASE_CONFIRMED_NON_PRODUCTION: "true" })).toThrow("loopback");
  });
});
