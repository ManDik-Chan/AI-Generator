import { z } from "zod";
import type { DraftDTO } from "./contracts";

/** Browser-safe read contracts. Hashing and database modules stay server-side. */
export type DraftReadDTO = DraftDTO & { contentHash: string };

const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const decision = z.enum(["PENDING", "APPROVED", "REJECTED", "INVALIDATED"]);
export const reviewDTOSchema = z.object({
  id: uuid, projectId: uuid, draftId: uuid, draftRevision: z.number().int().positive().max(2_147_483_647),
  decision, effectiveState: z.enum(["PENDING", "APPROVED", "REJECTED", "INVALIDATED", "SEALED"]),
  contentHash: hash, expiresAt: z.iso.datetime({ offset: true }), submittedByViewer: z.boolean(),
}).strict();
export type ReviewDTO = z.infer<typeof reviewDTOSchema>;

/** Existing B2-B command result; versionId remains optional for compatibility. */
export const releaseCommandResultSchema = z.object({
  id: uuid, projectId: uuid, versionId: uuid.optional(),
  state: z.enum(["PENDING", "APPROVED", "PUBLISHED", "WITHDRAWN"]),
}).strict();
export type ReleaseCommandResult = z.infer<typeof releaseCommandResultSchema>;

export const REGISTRY_ROLES = ["OWNER", "EDITOR", "REVIEWER", "PUBLISHER", "VIEWER"] as const;
export type RegistryRole = typeof REGISTRY_ROLES[number];

// Role membership is one gate only: every action independently requires a live
// Auth session and its own internal qualification. These maps grant no access.
export const REGISTRY_DRAFT_ROLES = {
  READ_DRAFT: ["OWNER", "EDITOR", "REVIEWER", "PUBLISHER", "VIEWER"],
  EDIT_DRAFT: ["OWNER", "EDITOR"], SUBMIT_REVIEW: ["OWNER", "EDITOR"],
  WITHDRAW_REVIEW: ["OWNER", "EDITOR"], DECIDE_REVIEW: ["REVIEWER"], SEAL_VERSION: ["OWNER", "EDITOR"],
} as const satisfies Record<string, readonly RegistryRole[]>;
export const REGISTRY_RELEASE_ROLES = {
  INGEST_ASSET: ["OWNER", "EDITOR"], VERIFY_ASSET: ["REVIEWER"],
  READ_RELEASE: ["OWNER", "EDITOR", "REVIEWER", "PUBLISHER", "VIEWER"],
  REQUEST_RELEASE: ["OWNER", "PUBLISHER"], APPROVE_RELEASE: ["REVIEWER"],
  PUBLISH_RELEASE: ["OWNER", "PUBLISHER"], WITHDRAW_RELEASE: ["OWNER", "PUBLISHER"],
  ROLLBACK_RELEASE: ["OWNER", "PUBLISHER"],
} as const satisfies Record<string, readonly RegistryRole[]>;
export const REGISTRY_ACTION_ROLES = { ...REGISTRY_DRAFT_ROLES, ...REGISTRY_RELEASE_ROLES };
export type RegistryAction = keyof typeof REGISTRY_ACTION_ROLES;

for (const roles of Object.values(REGISTRY_ACTION_ROLES)) Object.freeze(roles);
Object.freeze(REGISTRY_DRAFT_ROLES);
Object.freeze(REGISTRY_RELEASE_ROLES);
Object.freeze(REGISTRY_ACTION_ROLES);
