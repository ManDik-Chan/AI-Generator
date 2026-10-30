import { expect, it } from "vitest";
import { hashSnapshot } from "./canonical";
import { collectAssetReferences, collectReferencedAssetIds, draftDTOSchema, parseDraftPayload, releaseDTOSchema, validateDraftPayload, versionDTOSchema } from "./contracts";

const projectId = "15ca956a-dd68-4eef-8e8c-ab8bb075ea87", id = "45ca956a-dd68-4eef-8e8c-ab8bb075ea87", assetId = "35ca956a-dd68-4eef-8e8c-ab8bb075ea87";
const context = { projectId, slug: "registry-test" };
const payload = () => ({
  manifest: { schemaVersion: "0.5.0", projectId, slug: context.slug, version: "1.0.0", name: "Example", summary: "Registry fixture", category: "software", visibility: "PRIVATE", integration: { mode: "SHOWCASE" }, capabilities: ["documentation.read"], researchClaims: [] },
  presentation: { schemaVersion: "0.5.0", projectId, version: "1.0.0", title: "Example", sections: [] }, documentation: [],
});

it("validates strict Draft/Version DTOs and context without treating ORM fields as DTOs", () => {
  const candidate = validateDraftPayload(JSON.stringify(payload()), context);
  const draft = { id, projectId, revision: 1, state: "DRAFT", payload: candidate };
  expect(draftDTOSchema.parse(draft)).toEqual(draft);
  const version = { id, projectId, version: "1.0.0", snapshot: candidate, contentHash: hashSnapshot(candidate), hashAlgorithm: "JCS-SHA256-v1", reviewId: id, createdAt: "2026-10-31T00:00:00.000Z" };
  expect(versionDTOSchema.parse(version)).toEqual(version);
  expect(() => versionDTOSchema.parse({ ...version, contentHash: "a".repeat(64) })).toThrow();
  expect(() => versionDTOSchema.parse({ ...version, snapshot: { ...candidate, manifest: { ...candidate.manifest, name: "Tampered" } } })).toThrow();
  expect(() => draftDTOSchema.parse({ ...draft, ownerId: id })).toThrow();
  expect(() => draftDTOSchema.parse({ ...draft, publishedAt: version.createdAt })).toThrow();
  expect(() => draftDTOSchema.parse({ ...draft, projectId: id })).toThrow();
  expect(() => draftDTOSchema.parse({ ...draft, revision: 1.5 })).toThrow();
});
it.each(["owner", "ownerId", "credential", "storageRef", "publishedAt", "endpoint", "apiKey"])("rejects unknown privileged field %s at every editable object boundary", (key) => {
  const candidate = payload();
  for (const input of [ { ...candidate, [key]: "forged" }, { ...candidate, manifest: { ...candidate.manifest, [key]: "forged" } },
    { ...candidate, presentation: { ...candidate.presentation, [key]: "forged" } },
    { ...candidate, documentation: [{ id, title: "Readme", language: "en", assetId, [key]: "forged" }] }]) {
    expect(() => parseDraftPayload(input)).toThrow();
  }
});
it("rejects duplicates, non-L0 modes and unresolved identity/version semantics", () => {
  const candidate = payload();
  const invalid = [
    { ...candidate, manifest: { ...candidate.manifest, capabilities: ["documentation.read", "documentation.read"] } },
    { ...candidate, manifest: { ...candidate.manifest, integration: { mode: "REMOTE_API" } } },
    { ...candidate, manifest: { ...candidate.manifest, capabilities: ["execute"] } },
    { ...candidate, presentation: { ...candidate.presentation, projectId: id } },
    { ...candidate, presentation: { ...candidate.presentation, version: "1.0.1" } },
    { ...candidate, manifest: { ...candidate.manifest, researchClaims: [{ topic: "Test", status: "EXPERIMENT_VERIFIED", description: "Test", evidenceAssetIds: [] }] } },
    { ...candidate, documentation: [{ id, title: "Readme", language: "en", assetId }, { id, title: "Readme changed", language: "zh", assetId }] },
    { ...candidate, presentation: { ...candidate.presentation, sections: [{ id: "same", kind: "MARKDOWN", title: "A", body: "", sourceAssetIds: [] }, { id: "same", kind: "MARKDOWN", title: "B", body: "", sourceAssetIds: [] }] } },
  ];
  for (const input of invalid) expect(() => parseDraftPayload(input)).toThrow();
  expect(() => validateDraftPayload(candidate, { ...context, projectId: id })).toThrow();
  expect(() => validateDraftPayload(candidate, { ...context, slug: "another" })).toThrow();
  expect(() => parseDraftPayload('{"manifest":{},"manifest":{}}')).toThrow("Duplicate");
  expect(() => parseDraftPayload({ ...candidate, manifest: { ...candidate.manifest, name: "\ud800" } })).toThrow();
  expect(() => parseDraftPayload({ ...candidate, manifest: { ...candidate.manifest, researchClaims: [{ topic: "Case", status: "DOCUMENTED", description: "Test", evidenceAssetIds: [assetId, assetId.toUpperCase()] }] } })).toThrow();
  expect(() => parseDraftPayload({})).toThrow(); // B1 uninitialized drafts are not valid DTOs.
});
it("rejects hidden fields nested within integration, claims, presentation sections and metrics", () => {
  const candidate = payload();
  for (const input of [
    { ...candidate, manifest: { ...candidate.manifest, integration: { mode: "SHOWCASE", endpoint: "https://attacker.invalid" } } },
    { ...candidate, manifest: { ...candidate.manifest, researchClaims: [{ topic: "Test", status: "DOCUMENTED", description: "Test", evidenceAssetIds: [], credential: "secret" }] } },
    { ...candidate, presentation: { ...candidate.presentation, sections: [{ id: "text", kind: "MARKDOWN", title: "Text", body: "text", sourceAssetIds: [], storageRef: "private/source" }] } },
    { ...candidate, presentation: { ...candidate.presentation, sections: [{ id: "metric", kind: "BENCHMARKS", title: "Metric", metrics: [{ name: "Latency", status: "UNPUBLISHED", ownerId: id }] }] } },
  ]) expect(() => parseDraftPayload(input)).toThrow();
});
it("collects every document, claim, markdown, image and benchmark reference for trusted DB resolution", () => {
  const candidate = payload();
  const parsed = parseDraftPayload({ ...candidate,
    manifest: { ...candidate.manifest, researchClaims: [{ topic: "Evidence", status: "EXPERIMENT_VERIFIED", description: "Test", evidenceAssetIds: [assetId] }] },
    documentation: [{ id, title: "Readme", language: "en", assetId }],
    presentation: { ...candidate.presentation, sections: [
      { id: "markdown", kind: "MARKDOWN", title: "Readme", body: "text", sourceAssetIds: [assetId] },
      { id: "image", kind: "IMAGE", title: "Image", assetId, alt: "Example" },
      { id: "metrics", kind: "BENCHMARKS", title: "Metrics", metrics: [{ name: "Latency", status: "REPORTED", value: 1e-7, unit: "ms", dataset: "fixture", protocol: "fixture", modelVersion: "1", evidenceAssetId: assetId }] },
    ] },
  });
  expect(collectAssetReferences(parsed)).toHaveLength(5);
  expect(new Set(collectAssetReferences(parsed).map(({ usage }) => usage))).toEqual(new Set(["markdown", "image", "evidence"]));
  expect(collectReferencedAssetIds(parsed)).toEqual([assetId]);
});
it("rejects case aliases in each UUID reference array while preserving a single uppercase value", () => {
  const candidate = payload(), upper = assetId.toUpperCase();
  const claim = { topic: "Case", status: "DOCUMENTED", description: "Test", evidenceAssetIds: [upper] };
  const single = parseDraftPayload({ ...candidate, manifest: { ...candidate.manifest, researchClaims: [claim] } });
  expect(single.manifest.researchClaims[0].evidenceAssetIds).toEqual([upper]);
  expect(() => parseDraftPayload({ ...candidate, manifest: { ...candidate.manifest, researchClaims: [{ ...claim, evidenceAssetIds: [assetId, upper] }] } })).toThrow();
  expect(() => parseDraftPayload({ ...candidate, presentation: { ...candidate.presentation, sections: [
    { id: "case", kind: "MARKDOWN", title: "Case", body: "text", sourceAssetIds: [assetId, upper] },
  ] } })).toThrow();
});
it("defines a strict future ReleaseDTO without implementing publication", () => {
  const candidate = payload();
  const release = { schemaVersion: "0.5.0", projectId, releaseId: id, version: "1.0.0", name: "Example", summary: "Test", visibility: "PUBLIC", publishedAt: "2026-10-31T00:00:00Z", presentation: candidate.presentation, documentation: [], researchClaims: [] };
  expect(releaseDTOSchema.parse(release)).toEqual(release);
  for (const extra of [{ visibility: "PRIVATE" }, { storageRef: "private/source" }, { credential: "secret" }, { ownerId: id }]) expect(() => releaseDTOSchema.parse({ ...release, ...extra })).toThrow();
});
