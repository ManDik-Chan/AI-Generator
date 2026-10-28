import { readdirSync, readFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { resolve, relative, join, dirname } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function discoverIntegrationFiles(root) {
  const visit = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? visit(path) : entry.name.endsWith(".test.ts") ? [path] : [];
  });
  const files = visit(join(root, "tests", "integration")).map((path) => relative(root, path).replaceAll("\\", "/")).sort();
  if (!files.length) throw new Error("No real integration suites discovered.");
  return files;
}

export function verifyIntegrationReport(root, expected, report) {
  const actual = report.testResults?.map((suite) => relative(root, resolve(suite.name)).replaceAll("\\", "/")).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error("Integration suite discovery/execution mismatch.");
  if (!report.success || !report.numTotalTests || report.numFailedTests || report.numPendingTests || report.numTodoTests) {
    throw new Error("Real integration tests failed, skipped, pending, empty, or TODO.");
  }
  if (report.testResults.reduce((count, suite) => count + (suite.assertionResults?.length ?? 0), 0) !== report.numTotalTests) {
    throw new Error("Integration assertion count does not match the report total.");
  }
  for (const suite of report.testResults) {
    if (suite.status !== "passed" || !suite.assertionResults?.length
      || suite.assertionResults.some((test) => test.status !== "passed")) {
      throw new Error("Every discovered suite and assertion must actually pass; unexpected skip is a failure.");
    }
  }
  return { suites: actual.length, tests: report.numTotalTests };
}

export function requireIsolatedEnvironment(env) {
  const required = ["TEST_DATABASE_URL", "DATABASE_URL", "SUPABASE_TEST_URL", "SUPABASE_TEST_ANON_KEY", "SUPABASE_TEST_SERVICE_ROLE_KEY"];
  if (required.some((key) => !env[key]?.trim()) || env.ALLOW_TEST_DATABASE_MUTATIONS !== "true"
    || env.TEST_DATABASE_CONFIRMED_NON_PRODUCTION !== "true" || env.DATABASE_URL !== env.TEST_DATABASE_URL) {
    throw new Error("Complete real integration acceptance requires the same disposable database, both mutation safety flags, and local Supabase Auth configuration.");
  }
  const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (![env.TEST_DATABASE_URL, env.SUPABASE_TEST_URL].every((value) => loopback.has(new URL(value).hostname))) {
    throw new Error("This runner accepts loopback-only disposable database and Supabase endpoints.");
  }
}

export function main() {
  const root = process.cwd();
  requireIsolatedEnvironment(process.env);
  const files = discoverIntegrationFiles(root);
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
  const resultDirectory = resolve("test-results");
  mkdirSync(resultDirectory, { recursive: true });
  const reportPath = join(mkdtempSync(join(resultDirectory, "security-integration-")), "report.json");
  console.info(`Discovered ${files.length} real integration suites: ${files.join(", ")}`);
  // Suites share one disposable DB. Keep fixtures in separate execution windows;
  // concurrency attacks inside each suite still run with Promise.all as written.
  const result = spawnSync(process.execPath, [cli, "run", ...files, "--no-file-parallelism", "--reporter=default", "--reporter=json", `--outputFile.json=${reportPath}`], {
    cwd: root, stdio: "inherit", env: { ...process.env, REQUIRE_SECURITY_TEST_DATABASE: "true" },
  });
  if (result.error || result.status !== 0) throw new Error("Real integration process did not succeed; no security acceptance granted.");
  console.info("Verified complete real integration acceptance", verifyIntegrationReport(root, files, JSON.parse(readFileSync(reportPath, "utf8"))));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
