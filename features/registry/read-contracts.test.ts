import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { REGISTRY_ACTION_ROLES, REGISTRY_DRAFT_ROLES, REGISTRY_RELEASE_ROLES, releaseCommandResultSchema, reviewDTOSchema } from "./read-contracts";

const id = "15ca956a-dd68-4eef-8e8c-ab8bb075ea87";
const review = { id, projectId: id, draftId: id, draftRevision: 1, decision: "APPROVED", effectiveState: "SEALED",
  contentHash: "a".repeat(64), expiresAt: "2026-10-31T00:00:00.000Z", submittedByViewer: false };

it("exports a strict review whitelist with a viewer-relative identity instead of review parties", () => {
  expect(reviewDTOSchema.parse(review)).toEqual(review);
  for (const field of ["submitterId", "reviewerId", "assetDigestSet", "storageRef", "authzEpoch", "policyRevision", "credential", "accessToken"]) {
    expect(reviewDTOSchema.safeParse({ ...review, [field]: id }).success).toBe(false);
  }
  expect(reviewDTOSchema.safeParse({ ...review, submittedByViewer: undefined }).success).toBe(false);
  expect(reviewDTOSchema.safeParse({ ...review, draftRevision: 0 }).success).toBe(false);
  expect(reviewDTOSchema.safeParse({ ...review, contentHash: "untrusted" }).success).toBe(false);
});

it("exports the existing release command result without ORM and authorization details", () => {
  for (const state of ["PENDING", "APPROVED", "PUBLISHED", "WITHDRAWN"]) {
    expect(releaseCommandResultSchema.parse({ id, projectId: id, versionId: id, state }).state).toBe(state);
  }
  expect(releaseCommandResultSchema.parse({ id, projectId: id, state: "PENDING" })).not.toHaveProperty("versionId");
  for (const field of ["requesterId", "reviewerId", "authorizationId", "actorId", "assetDigestSet", "storageRef", "credential"]) {
    expect(releaseCommandResultSchema.safeParse({ id, projectId: id, state: "APPROVED", [field]: id }).success).toBe(false);
  }
});

it.each([
  ["features/registry/protocol.ts", REGISTRY_DRAFT_ROLES],
  ["features/registry/release-context.ts", REGISTRY_RELEASE_ROLES],
] as const)("keeps the shared role contract identical to %s", (file, shared) => {
  const source = readFileSync(file, "utf8"), block = /const roles: Record<Action, string\[\]> = \{([\s\S]*?)\};/.exec(source)?.[1];
  expect(block).toBeTruthy();
  const parsed = Object.fromEntries([...block!.matchAll(/([A-Z_]+): \[([^\]]*)\]/g)]
    .map(([, action, list]) => [action, [...list.matchAll(/"([A-Z]+)"/g)].map(match => match[1])]));
  expect(shared).toEqual(parsed);
});

it("ships no server runtime dependency or mutable role array through the shared contract", () => {
  const source = readFileSync("features/registry/read-contracts.ts", "utf8");
  expect(source).toContain('import type { DraftDTO } from "./contracts"');
  expect(source).not.toMatch(/from ["'](?:node:|@prisma|\.\/canonical|\.\/protocol|\.\/release)/);
  expect(Object.isFrozen(REGISTRY_ACTION_ROLES)).toBe(true);
  for (const roles of Object.values(REGISTRY_ACTION_ROLES)) expect(Object.isFrozen(roles)).toBe(true);
});
