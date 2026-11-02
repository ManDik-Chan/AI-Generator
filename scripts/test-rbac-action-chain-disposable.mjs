// Final platform-role database stage for a disposable CI Supabase. Destructive: it resets the
// guarded loopback database twice and leaves protected OWNER fixtures behind, so it must run as
// the last database stage of an instance that is destroyed afterwards.
//
// 1. Reset, then run the reviewed OWNER bootstrap runbook and the OWNER JWT isolation checks
//    (scripts/verify-platform-owner-privacy.mjs).
// 2. Reset again, then run the real platform-role request chain suite with OWNER, ADMIN and USER
//    sessions (tests/rbac-chain/platform-rbac-action-chain.test.ts). Every test must pass; a skip
//    fails the stage.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { assertDisposableTarget, bindDisposableLoopback } from "./disposable-supabase.mjs";
import { requireIsolatedEnvironment, verifyIntegrationReport } from "./run-security-integration.mjs";

const SUITE = "tests/rbac-chain/platform-rbac-action-chain.test.ts";
const root = process.cwd();
const require = createRequire(import.meta.url);
const prisma = require.resolve("prisma/build/index.js");
const vitest = join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const supabase = join(root, "node_modules/supabase/dist/supabase.js");

function run(label, args, { quiet = false, env = process.env } = {}) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: quiet ? "pipe" : "inherit", encoding: "utf8", windowsHide: true });
  // Reset and migration output can carry connection strings; it is never printed.
  assert.equal(result.status, 0, `${label} failed${quiet ? "; credential-bearing output suppressed" : ""}`);
}

async function resetDatabase() {
  const target = assertDisposableTarget();
  run("Supabase disposable database reset", [supabase, "db", "reset", "--local", "--no-seed", "--workdir", target.workdir], { quiet: true });
  await bindDisposableLoopback(target.workdir);
  assertDisposableTarget();
  run("Prisma migration deploy", [prisma, "migrate", "deploy"], { quiet: true });
}

async function main() {
  assert.equal(process.env.RBAC_DISPOSABLE_DESTROY_AFTER_TEST, "true", "This stage leaves OWNER fixtures and requires destruction of the disposable instance");
  requireIsolatedEnvironment(process.env);
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_TEST_URL, "The application Supabase URL must be the disposable stack");
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, process.env.SUPABASE_TEST_ANON_KEY, "The application anon key must be the disposable stack's");

  await resetDatabase();
  run("OWNER bootstrap runbook and OWNER JWT isolation", ["scripts/verify-platform-owner-privacy.mjs"]);

  await resetDatabase();
  mkdirSync(resolve("test-results"), { recursive: true });
  const reportPath = join(mkdtempSync(join(resolve("test-results"), "rbac-chain-")), "report.json");
  run("Platform role request chain", [vitest, "run", SUITE, "--reporter=default", "--reporter=json", `--outputFile.json=${reportPath}`], {
    env: { ...process.env, RBAC_ACTION_CHAIN_DISPOSABLE: "true" },
  });
  const summary = verifyIntegrationReport(root, [SUITE], JSON.parse(readFileSync(reportPath, "utf8")));
  console.info(`Platform role request chain passed with real sessions: ${summary.tests} tests in ${summary.suites} suite; OWNER fixtures retained for destruction.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
