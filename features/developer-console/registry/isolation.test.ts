/*
 * Mock and Registry modes must not leak into each other. The Registry runtime graph may not reach
 * the mock engine, the mock provider, the browser JCS hasher or any server-only Registry module, and
 * every write entry point of the Registry adapter must refuse without a request.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createMockConsoleAdapter } from "@/features/developer-console/mock/adapter";
import { RegistryWritesUnavailableError, createRegistryReadAdapter } from "@/features/developer-console/registry/adapter";
import type { ConsoleCommand } from "@/features/developer-console/model";
import { PROJECT, TOKEN, defaultRoutes, fakeFetch } from "@/tests/fixtures/registry-console-read";

const root = resolve(__dirname, "../../..");
const rel = (path: string) => relative(root, path).replaceAll("\\", "/");

function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? join(root, specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && !candidate.endsWith("/") && /\.(ts|tsx)$/.test(candidate)) return candidate;
  }
  throw new Error(`Unresolved ${specifier} from ${rel(from)}`);
}

/** Every repository module reachable through value imports (type-only imports are erased at build time). */
function reachable(entries: string[]) {
  const seen = new Set<string>(), packages = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/^\s*(import|export)\s+(type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/gm)) {
      if (match[2]) continue;
      const target = resolveImport(file, match[3]);
      if (target) stack.push(target); else packages.add(match[3]);
    }
  }
  return { files: [...seen].map(rel).sort(), packages: [...packages].sort() };
}

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));

describe("Registry read-only mode is isolated from the mock", () => {
  // Everything that runs in the browser for this mode. The route pages are server components and
  // are checked separately below.
  const entries = [
    join(root, "app/developer/registry/layout.tsx"),
    ...walk(join(root, "features/developer-console/registry")).filter((file) => !file.endsWith(".test.ts")),
    ...["registry-provider", "registry-header", "registry-kit", "registry-workbench", "registry-project", "console-mode-switch"].map((name) => join(root, `features/developer-console/components/${name}.tsx`)),
  ];
  const graph = reachable(entries);

  it("never reaches the mock engine, the mock provider or the browser hasher", () => {
    expect(graph.files.length).toBeGreaterThan(entries.length);
    expect(graph.files.filter((file) => /features\/developer-console\/(mock\/|content-hash|components\/console-provider|components\/release-desk|components\/console-header)/.test(file))).toEqual([]);
  });

  it("uses only the browser-safe Registry contract modules and no server-only code", () => {
    expect(graph.files.filter((file) => file.startsWith("features/registry/"))).toEqual(["features/registry/query-contracts.ts", "features/registry/read-contracts.ts"]);
    expect(graph.files.filter((file) => /^lib\/(database|auth\/session|auth\/supabase\/(server|admin))/.test(file))).toEqual([]);
    expect(graph.packages.filter((name) => name === "server-only" || name.startsWith("node:") || name.startsWith("@prisma"))).toEqual([]);
  });

  it("route pages add only the session check and the ID shape check on the server", () => {
    const pages = walk(join(root, "app/developer/registry")).filter((file) => file.endsWith("page.tsx"));
    expect(pages.map(rel).sort()).toEqual(["app/developer/registry/page.tsx", "app/developer/registry/projects/[projectId]/page.tsx"]);
    for (const page of pages) {
      const imports = [...readFileSync(page, "utf8").matchAll(/^import\s+(?!type\b)[^"']*["']([^"']+)["']/gm)].map((match) => match[1]);
      expect(imports.every((name) => ["next/navigation", "@/lib/auth/session", "@/features/developer-console/registry/contract"].includes(name)
        || /^@\/features\/developer-console\/components\/registry-(workbench|project)$/.test(name)), rel(page)).toBe(true);
    }
  });

  it("keeps the two providers in separate route layouts", () => {
    const parent = readFileSync(join(root, "app/developer/layout.tsx"), "utf8");
    const mock = readFileSync(join(root, "app/developer/(mock)/layout.tsx"), "utf8");
    const registry = readFileSync(join(root, "app/developer/registry/layout.tsx"), "utf8");
    expect(parent).not.toMatch(/ConsoleProvider|RegistryConsoleProvider/);
    expect(mock).toContain("<ConsoleProvider>");
    expect(mock).not.toContain("RegistryConsoleProvider");
    expect(registry).toContain("<RegistryConsoleProvider>");
    expect(registry).not.toMatch(/[^y]ConsoleProvider|mock\//);
    expect(existsSync(join(root, "app/developer/(mock)/projects/[slug]/page.tsx"))).toBe(true);
  });
});

describe("Registry read-only adapter refuses every write", () => {
  const commands: ConsoleCommand[] = [
    { action: "EDIT_DRAFT", projectId: PROJECT, idempotencyKey: "edit_draft_1", ifMatch: '"draft:x:1"', input: {} as never },
    { action: "SUBMIT_REVIEW", projectId: PROJECT, idempotencyKey: "k", input: { expectedContentHash: "0".repeat(64) } },
    { action: "WITHDRAW_REVIEW", projectId: PROJECT, idempotencyKey: "k", input: { reviewId: PROJECT } },
    { action: "DECIDE_REVIEW", projectId: PROJECT, idempotencyKey: "k", input: { reviewId: PROJECT, decision: "APPROVED", expectedContentHash: "0".repeat(64) } },
    { action: "SEAL_VERSION", projectId: PROJECT, idempotencyKey: "k", input: { reviewId: PROJECT, expectedContentHash: "0".repeat(64) } },
    { action: "REQUEST_RELEASE", projectId: PROJECT, idempotencyKey: "k", input: { versionId: PROJECT, expectedContentHash: "0".repeat(64), intent: "PUBLISH" } },
    { action: "APPROVE_RELEASE", projectId: PROJECT, idempotencyKey: "k", input: { requestId: PROJECT } },
    { action: "PUBLISH_RELEASE", projectId: PROJECT, idempotencyKey: "k", input: { approvalId: PROJECT } },
    { action: "WITHDRAW_RELEASE", projectId: PROJECT, idempotencyKey: "k", input: { releaseId: PROJECT } },
    { action: "ROLLBACK_RELEASE", projectId: PROJECT, idempotencyKey: "k", input: { approvalId: PROJECT } },
    { action: "START_DRAFT", projectId: PROJECT, idempotencyKey: "k", input: { fromVersionId: PROJECT, version: "2.0.0" } },
  ];

  it.each(commands.map((command) => [command.action, command] as const))("%s rejects without a request", async (_action, command) => {
    const fake = fakeFetch(defaultRoutes());
    const getAccessToken = vi.fn(async () => TOKEN);
    const adapter = createRegistryReadAdapter({ fetch: fake.fetch, getAccessToken });
    await expect(adapter.execute(command)).rejects.toBeInstanceOf(RegistryWritesUnavailableError);
    await expect(adapter.replay(1)).rejects.toMatchObject({ code: "READ_ONLY" });
    expect(fake.calls).toHaveLength(0);
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("identifies itself as the read-only Registry source with no mock tools", () => {
    const adapter = createRegistryReadAdapter({ fetch: fakeFetch({}).fetch, getAccessToken: async () => TOKEN });
    expect(adapter).toMatchObject({ source: "registry", readOnly: true, tools: null });
    expect(adapter.project(PROJECT)).toBe(adapter.project(PROJECT.toUpperCase()));
    const mock = createMockConsoleAdapter({ latency: 0 });
    expect(mock.source).toBe("mock");
    expect(mock.tools).not.toBeNull();
  });
});
