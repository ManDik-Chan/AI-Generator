import { describe, expect, it } from "vitest";

import { platformProjects } from "@/features/platform/fixtures";
import { buildManifest, exampleManifest, slugify, validateManifest } from "@/features/platform/manifest";
import { advanceRun, canTransition, isTerminal } from "@/features/platform/run-lifecycle";
import { getMyProject, getPublicProject, listMyProjects, listPublicProjects, publicProjectSlugs } from "@/features/platform/source";
import { algorithms, comparisonTable, distributions, makeInput, runSort } from "@/features/platform/sorting";
import { boundaryPoints, generateVolume, readSlice } from "@/features/platform/volume";

const valid = () => JSON.parse(exampleManifest) as Record<string, unknown>;
const errorsOf = (value: unknown) => validateManifest(JSON.stringify(value)).issues.filter((issue) => issue.level === "error").map((issue) => issue.path);

describe("P0.5 manifest validator", () => {
  it("accepts the bundled example", () => {
    const result = validateManifest(exampleManifest);
    expect(result.ok).toBe(true);
    expect(result.issues.filter((issue) => issue.level === "error")).toEqual([]);
  });

  it("rejects invalid JSON and non-objects", () => {
    expect(validateManifest("{").ok).toBe(false);
    expect(validateManifest("[]").issues[0].path).toBe("$");
  });

  it("enforces required fields and forbids unknown keys", () => {
    const manifest = valid();
    delete manifest.slug;
    manifest.endpointUrl = "https://example.com";
    expect(errorsOf(manifest)).toEqual(expect.arrayContaining(["slug", "endpointUrl"]));
  });

  it("checks the contract formats", () => {
    expect(errorsOf({ ...valid(), schemaVersion: "1.0.0" })).toContain("schemaVersion");
    expect(errorsOf({ ...valid(), projectId: "ctmr-4c" })).toContain("projectId");
    expect(errorsOf({ ...valid(), slug: "Bad_Slug" })).toContain("slug");
    expect(errorsOf({ ...valid(), version: "1.0" })).toContain("version");
    expect(errorsOf({ ...valid(), category: "medical" })).toContain("category");
    expect(errorsOf({ ...valid(), visibility: "SECRET" })).toContain("visibility");
  });

  it("only allows SHOWCASE integration in P0.5", () => {
    const result = validateManifest(JSON.stringify({ ...valid(), integration: { mode: "REMOTE_API" } }));
    expect(result.ok).toBe(false);
    expect(result.issues.find((issue) => issue.path === "integration.mode")?.message).toContain("尚未开放");
  });

  it("limits and de-duplicates capabilities", () => {
    expect(errorsOf({ ...valid(), capabilities: [] })).toContain("capabilities");
    expect(errorsOf({ ...valid(), capabilities: ["documentation.read", "documentation.read"] })).toContain("capabilities[1]");
    expect(errorsOf({ ...valid(), capabilities: ["inference.async"] })).toContain("capabilities[0]");
  });

  it("validates research claims and warns about unsupported verification", () => {
    const manifest = valid();
    manifest.researchClaims = [{ topic: "x", status: "EXPERIMENT_VERIFIED", description: "y", evidenceAssetIds: [] }];
    const result = validateManifest(JSON.stringify(manifest));
    expect(result.ok).toBe(true);
    expect(result.issues.some((issue) => issue.level === "warning" && issue.path.endsWith("evidenceAssetIds"))).toBe(true);
    manifest.researchClaims = [{ topic: "x", status: "PROVEN", description: "y", evidenceAssetIds: ["nope"] }];
    expect(errorsOf(manifest)).toEqual(expect.arrayContaining(["researchClaims[0].status", "researchClaims[0].evidenceAssetIds[0]"]));
  });

  it("builds valid manifests from the wizard and slugifies names", () => {
    const manifest = buildManifest({ projectId: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b", slug: "my-project", name: "My project", summary: "A project used in the unit test suite.", category: "software", visibility: "PRIVATE", capabilities: ["documentation.read"] });
    expect(validateManifest(manifest).ok).toBe(true);
    expect(slugify("Sorting Lab 2")).toBe("sorting-lab-2");
    expect(slugify("体数据")).toBe("");
  });
});

describe("run lifecycle", () => {
  it("follows the documented transitions", () => {
    expect(canTransition("PENDING", "ACCEPTED")).toBe(true);
    expect(canTransition("RUNNING", "TIMED_OUT")).toBe(true);
    expect(canTransition("PENDING", "SUCCEEDED")).toBe(false);
  });

  it("keeps terminal states final and idempotent", () => {
    expect(isTerminal("SUCCEEDED")).toBe(true);
    expect(advanceRun("SUCCEEDED", "RUNNING")).toBe("SUCCEEDED");
    expect(advanceRun("CANCELLED", "CANCELLED")).toBe("CANCELLED");
  });
});

describe("platform visibility rules", () => {
  it("lists only public projects in Explore", () => {
    expect(listPublicProjects().data.every((project) => project.visibility === "PUBLIC")).toBe(true);
    expect(listPublicProjects().source).toBe("demo");
  });

  it("reaches unlisted projects by slug and never private ones", () => {
    const unlisted = platformProjects.find((project) => project.visibility === "UNLISTED");
    const hidden = platformProjects.find((project) => project.visibility === "PRIVATE");
    expect(unlisted && getPublicProject(unlisted.slug).data?.slug).toBe(unlisted?.slug);
    expect(hidden && getPublicProject(hidden.slug).data).toBeUndefined();
    expect(publicProjectSlugs()).not.toContain(hidden?.slug);
  });

  it("scopes the workspace to the viewer's projects", () => {
    expect(listMyProjects().data.every((project) => project.ownedByViewer)).toBe(true);
    expect(getMyProject("ai-generator").data).toBeUndefined();
  });

  it("keeps sample metrics unpublished unless they are computed live", () => {
    for (const project of platformProjects.filter((item) => item.provenance === "sample")) {
      for (const metric of project.benchmarks) expect(["UNPUBLISHED", "COMPUTED_LIVE"]).toContain(metric.status);
    }
  });

  it("uses unique slugs", () => {
    expect(new Set(platformProjects.map((project) => project.slug)).size).toBe(platformProjects.length);
  });
});

describe("sorting lab", () => {
  it("sorts every distribution correctly with every algorithm", () => {
    for (const distribution of distributions) {
      const input = makeInput(distribution.key, 48, 7);
      const expected = [...input].sort((a, b) => a - b);
      for (const algorithm of algorithms) expect(runSort(algorithm.key, input).sorted).toEqual(expected);
    }
  });

  it("is deterministic for a seed and counts plausible comparisons", () => {
    expect(comparisonTable(64, 2026)).toEqual(comparisonTable(64, 2026));
    const reversed = makeInput("reversed", 64, 1);
    expect(runSort("insertion", reversed).comparisons).toBe((64 * 63) / 2);
    expect(runSort("insertion", makeInput("reversed", 8, 1), true).steps.length).toBeGreaterThan(0);
  });
});

describe("synthetic volume", () => {
  it("is deterministic, bounded and segmentable", () => {
    const a = generateVolume(16, 3);
    expect(a).toEqual(generateVolume(16, 3));
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a)).toBeLessThanOrEqual(1);
    expect(readSlice(a, 16, "coronal", 8).length).toBe(256);
    expect(boundaryPoints(generateVolume(24, 3), 24, 0.7, 1).length).toBeGreaterThan(0);
  });
});
