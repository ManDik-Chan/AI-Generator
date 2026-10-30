/*
 * Consistency between the developer docs, the code and the contracts.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { demos } from "@/features/demos/catalog";
import { listCapabilities } from "@/features/demos/runtime/registry";
import { findExamples, syncExamples } from "@/features/docs/sync";
import { headingSlug, readDoc, tableOfContents } from "@/features/docs/content";
import { CLAIM_STATUSES, MANIFEST_CAPABILITIES, MANIFEST_CATEGORIES, MANIFEST_SCHEMA_VERSION, MANIFEST_VISIBILITIES } from "@/features/platform/manifest";

const root = process.cwd();
const docsDir = join(root, "docs/developer");
const markdown = readdirSync(docsDir).filter((name) => name.endsWith(".md"));

describe("developer docs", () => {
  it.each(markdown)("%s embeds examples that match their files (pnpm docs:sync)", (file) => {
    const text = readFileSync(join(docsDir, file), "utf8");
    for (const example of findExamples(text)) expect(existsSync(join(root, example.path)), example.path).toBe(true);
    expect(syncExamples(text, (path) => readFileSync(join(root, path), "utf8")).changed).toBe(false);
  });

  it("embeds every example file somewhere", () => {
    const embedded = new Set(markdown.flatMap((file) => findExamples(readFileSync(join(docsDir, file), "utf8")).map((example) => example.path)));
    for (const path of ["examples/demo-api/solve.mjs", "examples/demo-api/stream.mjs", "examples/capabilities/text-stats.ts", "examples/browser/train-once.ts", "examples/manifest/manifest.json"]) {
      expect(embedded.has(path), path).toBe(true);
    }
  });

  it("only links to site routes and anchors that exist", () => {
    const anchors = new Map<string, Set<string>>();
    for (const [route, file] of [["/docs/guide", "guide.md"], ["/docs/api", "api-reference.md"], ["/docs/manifest", "manifest.md"], ["/docs/status", "interface-status.md"]] as const) {
      anchors.set(route, new Set(tableOfContents(readDoc(file)).map((entry) => entry.id)));
    }
    const pages = new Set(["/", "/demos", "/demos/route-optimizer", "/demos/neural-network", "/docs", "/explore", "/platform/developer", "/api/demo/v1/openapi.json", "/api/demo/v1/capabilities", ...anchors.keys()]);
    for (const source of markdown.map((file) => readFileSync(join(docsDir, file), "utf8"))) {
      for (const [, path, hash] of source.matchAll(/\]\((\/[^)#\s]*)(?:#([^)\s]+))?\)/g)) {
        expect(pages.has(path), `unknown route ${path}`).toBe(true);
        if (hash && anchors.has(path)) expect(anchors.get(path)!.has(decodeURIComponent(hash)), `${path}#${hash}`).toBe(true);
      }
    }
    for (const capability of listCapabilities()) {
      const [path, hash] = capability.docsPath.split("#");
      if (hash) expect(anchors.get(path)?.has(hash), capability.docsPath).toBe(true);
    }
  });

  it("slugs headings the way the site renders them", () => {
    expect(headingSlug("route-optimizer.solve")).toBe("route-optimizer-solve");
    expect(headingSlug("POST /api/demo/v1/runs")).toBe("post-api-demo-v1-runs");
    expect(headingSlug("设计契约（未部署）")).toBe("设计契约-未部署");
  });
});

describe("contracts copied into docs/developer/contracts", () => {
  const schema = JSON.parse(readFileSync(join(docsDir, "contracts/manifest.schema.json"), "utf8"));
  const manifest = schema.$defs.Manifest.properties;

  it("agrees with the hand-written P0.5 validator", () => {
    expect(manifest.schemaVersion.const).toBe(MANIFEST_SCHEMA_VERSION);
    expect(manifest.category.enum).toEqual([...MANIFEST_CATEGORIES]);
    expect(manifest.visibility.enum).toEqual([...MANIFEST_VISIBILITIES]);
    expect(manifest.capabilities.items.enum).toEqual([...MANIFEST_CAPABILITIES]);
    expect(schema.$defs.Claim.properties.status.enum).toEqual([...CLAIM_STATUSES]);
    expect(manifest.integration.properties.mode.const).toBe("SHOWCASE");
  });
});

describe("demo catalog", () => {
  it("matches the capability descriptors", () => {
    const capabilities = listCapabilities();
    for (const demo of demos) {
      const capability = capabilities.find((item) => item.id === demo.capability);
      expect(capability, demo.capability).toBeDefined();
      expect(capability?.execution).toBe(demo.execution);
      expect(capability?.project).toBe(demo.slug);
      expect(capability?.sourcePath).toBe(demo.sourcePath);
      expect(existsSync(join(root, demo.sourcePath))).toBe(true);
    }
  });
});
