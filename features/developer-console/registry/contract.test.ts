import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { HASH_ALGORITHM as SERVER_HASH_ALGORITHM, hashSnapshot } from "@/features/registry/canonical";
import { draftDTOSchema, draftPayloadSchema, versionDTOSchema } from "@/features/registry/contracts";
import { createSeedState } from "@/features/developer-console/mock/seed";
import { HASH_ALGORITHM, draftHeadReadSchema, draftReadSchema, envelopeSchema, payloadViewSchema, versionReadSchema } from "@/features/developer-console/registry/contract";
import { draftRead, payload, versions } from "@/tests/fixtures/registry-console-read";

type Def = { type: string; shape?: Record<string, z.ZodType>; element?: z.ZodType; innerType?: z.ZodType; options?: z.ZodType[];
  discriminator?: string; entries?: Record<string, string>; values?: unknown[]; catchall?: z.ZodType };
const defOf = (schema: z.ZodType) => (schema as unknown as { def: Def }).def;

/** Structural fingerprint: object keys and strictness, nesting, optionality, enums and literals. */
function shape(schema: z.ZodType): unknown {
  const def = defOf(schema);
  switch (def.type) {
    case "object": return { strict: def.catchall ? defOf(def.catchall).type === "never" : false,
      keys: Object.fromEntries(Object.keys(def.shape!).sort().map((key) => [key, shape(def.shape![key])])) };
    case "array": return [shape(def.element!)];
    case "optional": return { optional: shape(def.innerType!) };
    case "nullable": return { nullable: shape(def.innerType!) };
    case "union": return { union: def.discriminator ?? null, options: def.options!.map(shape).map((item) => JSON.stringify(item)).sort() };
    case "enum": return { enum: Object.values(def.entries!).sort() };
    case "literal": return { literal: def.values };
    default: return def.type;
  }
}

describe("browser mirror of the server Draft and Version schemas", () => {
  it("matches the server payload schema field for field, at every level", () => {
    expect(shape(payloadViewSchema)).toEqual(shape(draftPayloadSchema));
    // The fingerprint itself must notice a one-field drift deep in the tree.
    const drifted = payloadViewSchema.extend({ manifest: payloadViewSchema.shape.manifest.extend({ license: payloadViewSchema.shape.manifest.shape.name.optional() }) });
    expect(shape(drifted)).not.toEqual(shape(draftPayloadSchema));
  });

  it("matches the server DraftDTO plus contentHash, and the VersionDTO", () => {
    const serverDraft = shape(draftDTOSchema) as { strict: boolean; keys: Record<string, unknown> };
    expect(shape(draftReadSchema)).toEqual({ ...serverDraft, keys: { ...serverDraft.keys, contentHash: "string" } });
    expect(shape(versionReadSchema)).toEqual(shape(versionDTOSchema));
    expect(HASH_ALGORITHM).toBe(SERVER_HASH_ALGORITHM);
  });

  it("accepts every payload and sealed version the mock seed builds with the real schemas", () => {
    const { projects } = createSeedState();
    const payloads = projects.flatMap((project) => project.drafts.flatMap((draft) => (draft.payload ? [draft.payload] : [])));
    const sealed = projects.flatMap((project) => project.versions);
    expect(payloads.length).toBeGreaterThan(3);
    expect(sealed.length).toBeGreaterThan(3);
    for (const item of payloads) expect(payloadViewSchema.parse(item)).toEqual(draftPayloadSchema.parse(item));
    for (const version of sealed) expect(versionReadSchema.parse(version)).toEqual(versionDTOSchema.parse(version));
  });

  it("rejects unknown fields at each nesting level instead of stripping them", () => {
    const inject = (path: string[]) => {
      const copy = structuredClone(draftRead) as Record<string, unknown>;
      let target = copy as Record<string, unknown>;
      for (const key of path) target = target[key] as Record<string, unknown>;
      target.ownerId = "00000000-0000-4000-8000-000000000000";
      return copy;
    };
    expect(draftReadSchema.safeParse(draftRead).success).toBe(true);
    for (const path of [[], ["payload"], ["payload", "manifest"], ["payload", "manifest", "integration"], ["payload", "presentation"], ["payload", "presentation", "sections", "0"]]) {
      expect(draftReadSchema.safeParse(inject(path)).success, path.join(".")).toBe(false);
    }
    expect(versionReadSchema.safeParse({ ...versions[0], storageRef: "bucket/key" }).success).toBe(false);
    expect(draftHeadReadSchema.safeParse({ id: draftRead.id, projectId: draftRead.projectId, revision: 3, state: "DRAFT", contentHash: null, authzEpoch: 4 }).success).toBe(false);
  });

  it("checks the envelope: replayed must be false, ETags must have the documented form", () => {
    const head = { id: draftRead.id, projectId: draftRead.projectId, revision: 3, state: "DRAFT", contentHash: null };
    const draftEnvelope = envelopeSchema(draftHeadReadSchema, "draft");
    expect(draftEnvelope.safeParse({ result: head, etag: `"draft:${draftRead.id}:3"`, replayed: false }).success).toBe(true);
    expect(draftEnvelope.safeParse({ result: head, etag: `"draft:${draftRead.id}:3"`, replayed: true }).success).toBe(false);
    expect(draftEnvelope.safeParse({ result: head, etag: `W/"draft:${draftRead.id}:3"`, replayed: false }).success).toBe(false);
    expect(draftEnvelope.safeParse({ result: head, etag: `"release:${draftRead.id}:3"`, replayed: false }).success).toBe(false);
    expect(draftEnvelope.safeParse({ result: head, replayed: false }).success).toBe(false);
    expect(envelopeSchema(draftHeadReadSchema, null).safeParse({ result: head, etag: `"draft:${draftRead.id}:3"`, replayed: false }).success).toBe(false);
  });

  it("does not hash: the server's contentHash is taken as given and only its form is checked", () => {
    expect(draftRead.contentHash).toBe(hashSnapshot(payload));
    const other = { ...draftRead, contentHash: "f".repeat(64) };
    expect(draftReadSchema.safeParse(other).success).toBe(true);
    expect(draftReadSchema.safeParse({ ...draftRead, contentHash: "F".repeat(64) }).success).toBe(false);
  });
});
