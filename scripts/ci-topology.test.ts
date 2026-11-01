/*
 * Contract for the CI topology (docs/ci-pipeline.md). The required status checks of the main
 * ruleset are job names; this keeps every one of them defined exactly once, keeps the single
 * authenticated browser matrix behind the real Supabase acceptance, and keeps every acceptance
 * stage present. It reads the workflow text with a minimal job-block parser (no YAML dependency).
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/** Required status checks of the "Protect main branch" ruleset on 2026-11-01. */
const REQUIRED_CHECKS = ["lint", "typecheck", "unit tests", "build", "authenticated Playwright", "Supabase Security Acceptance"];

interface Job { id: string; workflow: string; name: string; text: string; needs: string[]; condition: string | null }

function jobs(workflow: string): Job[] {
  const text = readFileSync(`.github/workflows/${workflow}.yml`, "utf8");
  const body = text.slice(text.indexOf("\njobs:\n") + 7);
  const blocks = body.split(/\n(?=  [a-z0-9-]+:\n)/);
  return blocks.map((block) => {
    const id = /^ {2}([a-z0-9-]+):/.exec(block)![1];
    const inline = /^ {4}needs: \[?([^\]\n]*)\]?$/m.exec(block)?.[1];
    const list = /^ {4}needs:\n((?: {6}- [a-z0-9-]+\n?)+)/m.exec(block)?.[1];
    const needs = inline ? inline.split(",").map((item) => item.trim()).filter(Boolean)
      : list ? [...list.matchAll(/- ([a-z0-9-]+)/g)].map((match) => match[1]) : [];
    return { id, workflow, text: block, needs, name: /^ {4}name: (.+)$/m.exec(block)![1], condition: /^ {4}if: (.+)$/m.exec(block)?.[1] ?? null };
  });
}

const all = [...jobs("merge-gates"), ...jobs("security-acceptance")];
const byId = (id: string) => all.find((job) => job.id === id && job.workflow === "security-acceptance")!;
/** Check names a job produces; the quality matrix expands its gate names. */
function checkNames(job: Job) {
  if (job.name === "${{ matrix.gate.name }}") return [...job.text.matchAll(/- name: (.+)\n\s+command:/g)].map((match) => match[1]);
  return [job.name];
}

describe("CI topology", () => {
  it("defines every required status check exactly once", () => {
    const names = all.flatMap(checkNames);
    for (const check of REQUIRED_CHECKS) expect(names.filter((name) => name === check), check).toHaveLength(1);
  });

  it("runs one authenticated browser matrix, with all three projects, after Supabase acceptance", () => {
    const browserJobs = all.filter((job) => job.text.includes("pnpm exec playwright test"));
    expect(browserJobs.map((job) => job.id)).toEqual(["authenticated-browser-acceptance"]);
    const [matrix] = browserJobs;
    for (const project of ["chromium-desktop", "chromium-mobile", "webkit-iphone"]) expect(matrix.text).toContain(`project: ${project}`);
    expect(matrix.needs).toEqual(["supabase-security-acceptance"]);
    expect(matrix.text).toContain("--workers=1");
    expect(jobs("merge-gates").some((job) => /supabase start|playwright/.test(job.text))).toBe(false);
  });

  it("keeps the required Supabase check fail-closed over both acceptance jobs", () => {
    const gate = byId("supabase-security-acceptance");
    expect(gate.name).toBe("Supabase Security Acceptance");
    expect(gate.condition).toBe("always()");
    expect(gate.needs.sort()).toEqual(["supabase-integration-acceptance", "supabase-upgrade-acceptance"]);
    expect(gate.text).toContain('"$INTEGRATION_RESULT" != "success"');
    expect(gate.text).toContain('"$UPGRADE_RESULT" != "success"');
    const browser = byId("authenticated-playwright");
    expect(browser.needs.sort()).toEqual(["authenticated-browser-acceptance", "supabase-security-acceptance"]);
    expect(browser.condition).toBe("always()");
  });

  it("keeps every database acceptance stage, each job on its own disposable Supabase", () => {
    const integration = byId("supabase-integration-acceptance"), upgrade = byId("supabase-upgrade-acceptance");
    const order = (job: Job, commands: string[]) => commands.map((command) => job.text.indexOf(command));
    const stages = order(integration, ["supabase start", "pnpm exec prisma migrate deploy", "node scripts/verify-rls-baseline.mjs",
      "node scripts/verify-security-migrations.mjs clean", "node scripts/verify-registry-migrations.mjs", "pnpm test:integration",
      "pnpm lint", "pnpm typecheck", 'pnpm exec vitest run --exclude "tests/integration/**"', "pnpm exec prisma validate", "supabase stop --no-backup"]);
    expect(stages.every((position, index) => position >= 0 && (index === 0 || position > stages[index - 1])), String(stages)).toBe(true);
    const upgrades = order(upgrade, ["supabase start", "node scripts/verify-security-migrations.mjs incremental",
      "node scripts/verify-security-migrations.mjs rollback-all", "supabase stop --no-backup"]);
    expect(upgrades.every((position, index) => position >= 0 && (index === 0 || position > upgrades[index - 1])), String(upgrades)).toBe(true);
    for (const job of [integration, upgrade]) {
      expect(job.needs).toEqual([]);
      expect(job.text).toContain('REQUIRE_SECURITY_TEST_DATABASE: "true"');
      expect(job.text).toContain('node scripts/disposable-supabase.mjs bind "$GITHUB_WORKSPACE"');
      expect(job.text).toMatch(/if: always\(\)\n\s+shell: bash\n\s+run: supabase stop --no-backup/);
    }
    // Each stage runs exactly once per commit.
    const workflowText = all.map((job) => job.text).join("\n");
    for (const command of ["pnpm test:integration", "verify-security-migrations.mjs clean", "verify-security-migrations.mjs incremental",
      "verify-security-migrations.mjs rollback-all", "verify-registry-migrations.mjs", "verify-rls-baseline.mjs"]) {
      expect(workflowText.split(command).length - 1, command).toBe(1);
    }
  });

  it("keeps the non-required gates and per-PR cancellation of superseded runs", () => {
    expect(all.map((job) => job.name)).toEqual(expect.arrayContaining(["Registry JCS Python reference", "Node 24 compatibility"]));
    for (const workflow of ["merge-gates", "security-acceptance"]) {
      const text = readFileSync(`.github/workflows/${workflow}.yml`, "utf8");
      expect(text).toContain(`group: ${workflow}-\${{ github.event.pull_request.number || github.ref }}`);
      expect(text).toContain("cancel-in-progress: true");
      expect(text).not.toMatch(/continue-on-error|paths-ignore|paths:/);
    }
  });
});
