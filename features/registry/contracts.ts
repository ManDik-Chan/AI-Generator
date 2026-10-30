import { z } from "zod";

import { CLAIM_STATUSES, MANIFEST_CAPABILITIES, MANIFEST_CATEGORIES, MANIFEST_SCHEMA_VERSION, MANIFEST_VISIBILITIES } from "@/features/platform/manifest";
import { assertUnicode, canonicalize, HASH_ALGORITHM, hashSnapshot, parseStrictJson } from "./canonical";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const semver = z.string().max(100).regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const unicode = z.string().refine((value) => { try { assertUnicode(value); return true; } catch { return false; } }, "Invalid I-JSON Unicode");
const text = unicode.min(1).max(500).refine((value) => value.trim().length > 0, "Text must not be blank");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().positive().max(2_147_483_647);
const dateTime = z.iso.datetime({ offset: true });
const unique = <T extends z.ZodType>(schema: T, max: number) => z.array(schema).max(max).superRefine((values, ctx) => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const encoded = canonicalize(value);
    if (seen.has(encoded)) ctx.addIssue({ code: "custom", path: [index], message: "Duplicate item" });
    seen.add(encoded);
  });
});
const assetIds = unique(uuid, 100).superRefine((ids, ctx) => {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id.toLowerCase())) ctx.addIssue({ code: "custom", path: [index], message: "Duplicate asset id" });
    seen.add(id.toLowerCase());
  });
});

export const researchClaimSchema = z.object({
  topic: text, status: z.enum(CLAIM_STATUSES), description: text,
  evidenceAssetIds: assetIds, modelVersion: text.optional(),
}).strict().superRefine((claim, ctx) => {
  if (claim.status === "EXPERIMENT_VERIFIED" && !claim.evidenceAssetIds.length) {
    ctx.addIssue({ code: "custom", path: ["evidenceAssetIds"], message: "Verified claims require evidence" });
  }
});

/** The existing 0.5.0 L0 contract. Runtime capabilities are independently versioned. */
export const manifestSchema = z.object({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION), projectId: uuid,
  slug: z.string().regex(/^[a-z][a-z0-9-]{2,62}$/), version: semver,
  name: text, summary: text, category: z.enum(MANIFEST_CATEGORIES), visibility: z.enum(MANIFEST_VISIBILITIES),
  integration: z.object({ mode: z.literal("SHOWCASE") }).strict(),
  capabilities: unique(z.enum(MANIFEST_CAPABILITIES), 3).min(1), researchClaims: unique(researchClaimSchema, 40),
}).strict();

const metricSchema = z.discriminatedUnion("status", [
  z.object({ name: text, status: z.literal("UNPUBLISHED") }).strict(),
  z.object({ name: text, status: z.literal("REPORTED"), value: z.number().finite(), unit: text,
    dataset: text, protocol: text, modelVersion: text, evidenceAssetId: uuid }).strict(),
]);
const sectionId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const sectionSchema = z.discriminatedUnion("kind", [
  z.object({ id: sectionId, kind: z.literal("MARKDOWN"), title: text, body: unicode.max(20_000), sourceAssetIds: assetIds }).strict(),
  z.object({ id: sectionId, kind: z.literal("IMAGE"), title: text, assetId: uuid, alt: text }).strict(),
  z.object({ id: sectionId, kind: z.literal("BENCHMARKS"), title: text, metrics: unique(metricSchema, 30) }).strict(),
]);
export const presentationSchema = z.object({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION), projectId: uuid, version: semver, title: text,
  sections: unique(sectionSchema, 24),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>();
  value.sections.forEach((section, index) => {
    if (seen.has(section.id)) ctx.addIssue({ code: "custom", path: ["sections", index, "id"], message: "Duplicate section id" });
    seen.add(section.id);
  });
});
export const documentationSchema = z.object({ id: uuid, title: text, language: z.enum(["zh", "en"]), assetId: uuid }).strict();
const documentationList = unique(documentationSchema, 30).superRefine((documents, ctx) => {
  const ids = new Set<string>(), assets = new Set<string>();
  documents.forEach((document, index) => {
    if (ids.has(document.id.toLowerCase()) || assets.has(document.assetId.toLowerCase())) ctx.addIssue({ code: "custom", path: [index], message: "Duplicate document id or asset" });
    ids.add(document.id.toLowerCase()); assets.add(document.assetId.toLowerCase());
  });
});
export const draftPayloadSchema = z.object({
  manifest: manifestSchema, presentation: presentationSchema, documentation: documentationList,
}).strict().superRefine((payload, ctx) => {
  if (payload.presentation.projectId.toLowerCase() !== payload.manifest.projectId.toLowerCase()) ctx.addIssue({ code: "custom", path: ["presentation", "projectId"], message: "Project identity mismatch" });
  if (payload.presentation.version !== payload.manifest.version) ctx.addIssue({ code: "custom", path: ["presentation", "version"], message: "Version mismatch" });
});
export type DraftPayload = z.infer<typeof draftPayloadSchema>;

/** Unknown fields are rejected at every level, not silently stripped. */
export const draftDTOSchema = z.object({
  id: uuid, projectId: uuid, revision, state: z.enum(["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"]), payload: draftPayloadSchema,
}).strict().superRefine((draft, ctx) => {
  if (draft.projectId.toLowerCase() !== draft.payload.manifest.projectId.toLowerCase()) ctx.addIssue({ code: "custom", path: ["payload", "manifest", "projectId"], message: "Draft project mismatch" });
});
export type DraftDTO = z.infer<typeof draftDTOSchema>;

export const versionDTOSchema = z.object({
  id: uuid, projectId: uuid, version: semver, snapshot: draftPayloadSchema, contentHash: hash,
  hashAlgorithm: z.literal(HASH_ALGORITHM), reviewId: uuid, createdAt: dateTime,
}).strict().superRefine((version, ctx) => {
  if (version.projectId.toLowerCase() !== version.snapshot.manifest.projectId.toLowerCase() || version.version !== version.snapshot.manifest.version) ctx.addIssue({ code: "custom", path: ["snapshot"], message: "Version identity mismatch" });
  if (version.contentHash !== hashSnapshot(version.snapshot)) ctx.addIssue({ code: "custom", path: ["contentHash"], message: "Snapshot hash mismatch" });
});
export type VersionDTO = z.infer<typeof versionDTOSchema>;

/** Future projection schema only. B2-A exposes no release builder or public endpoint. */
export const releaseDTOSchema = z.object({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION), projectId: uuid, releaseId: uuid, version: semver,
  name: text, summary: text, visibility: z.enum(["PUBLIC", "UNLISTED"]), publishedAt: dateTime,
  presentation: presentationSchema, documentation: documentationList, researchClaims: unique(researchClaimSchema, 40),
}).strict().superRefine((release, ctx) => {
  if (release.projectId.toLowerCase() !== release.presentation.projectId.toLowerCase() || release.version !== release.presentation.version) ctx.addIssue({ code: "custom", path: ["presentation"], message: "Release identity mismatch" });
});
export type ReleaseDTO = z.infer<typeof releaseDTOSchema>;

export function parseDraftPayload(input: unknown): DraftPayload {
  const value = typeof input === "string" ? parseStrictJson(input) : input;
  canonicalize(value); // Reject non-JSON data and malformed Unicode before schema parsing.
  return draftPayloadSchema.parse(value);
}

export function validateDraftPayload(input: unknown, context: { projectId: string; slug: string }): DraftPayload {
  const payload = parseDraftPayload(input);
  if (payload.manifest.projectId.toLowerCase() !== context.projectId.toLowerCase() || payload.manifest.slug !== context.slug) {
    throw new z.ZodError([{ code: "custom", path: ["manifest"], message: "Payload does not belong to the locked project" }]);
  }
  return payload;
}

export type AssetReference = { id: string; usage: "markdown" | "image" | "evidence" };
/** References must be resolved against approved same-project assets inside the command transaction. */
export function collectAssetReferences(payload: DraftPayload): AssetReference[] {
  const refs: AssetReference[] = payload.documentation.map((document) => ({ id: document.assetId.toLowerCase(), usage: "markdown" }));
  for (const claim of payload.manifest.researchClaims) refs.push(...claim.evidenceAssetIds.map((id) => ({ id: id.toLowerCase(), usage: "evidence" as const })));
  for (const section of payload.presentation.sections) {
    if (section.kind === "IMAGE") refs.push({ id: section.assetId.toLowerCase(), usage: "image" });
    else if (section.kind === "MARKDOWN") refs.push(...section.sourceAssetIds.map((id) => ({ id: id.toLowerCase(), usage: "evidence" as const })));
    else for (const metric of section.metrics) if (metric.status === "REPORTED") refs.push({ id: metric.evidenceAssetId.toLowerCase(), usage: "evidence" });
  }
  return refs;
}
export function collectReferencedAssetIds(payload: DraftPayload): string[] {
  return [...new Set(collectAssetReferences(payload).map(({ id }) => id))].sort();
}
