import { z } from "zod";
import { REGISTRY_ACTION_ROLES } from "./read-contracts";

const id = z.string().uuid();
const time = z.iso.datetime({ offset: true });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const registryRoleSchema = z.enum(["OWNER", "EDITOR", "REVIEWER", "PUBLISHER", "VIEWER"]);
const visibility = z.enum(["PRIVATE", "PUBLIC", "UNLISTED"]);
export const qualificationDTOSchema = z.object({ action: z.enum(Object.keys(REGISTRY_ACTION_ROLES) as [keyof typeof REGISTRY_ACTION_ROLES, ...(keyof typeof REGISTRY_ACTION_ROLES)[]]), expiresAt: time }).strict();
export const qualificationsDTOSchema = z.object({ actions: z.array(qualificationDTOSchema).max(14) }).strict();
export const projectSummaryDTOSchema = z.object({ id, slug: z.string().regex(/^[a-z][a-z0-9-]{2,62}$/), visibility,
  roles: z.array(registryRoleSchema).min(1).max(5) }).strict();
export const projectReadDTOSchema = projectSummaryDTOSchema.extend({ effectiveActions: z.array(qualificationDTOSchema).max(14) }).strict();
export const releaseHeadReadDTOSchema = z.object({ projectId: id, currentReleaseId: id.nullable(), visibility }).strict();
export const releaseRecordDTOSchema = z.object({ id, projectId: id, versionId: id, version: z.string().max(100), contentHash: hash,
  visibilityAtApproval: visibility, state: z.enum(["PUBLISHED", "WITHDRAWN"]), publishedAt: time, withdrawnAt: time.nullable(),
  intent: z.enum(["PUBLISH", "ROLLBACK"]).nullable() }).strict();
export const releaseRequestDTOSchema = z.object({ id, projectId: id, versionId: id, version: z.string().max(100), contentHash: hash,
  intent: z.enum(["PUBLISH", "ROLLBACK"]), targetReleaseId: id.nullable(), visibility, expiresAt: time, approvalId: id.nullable(),
  state: z.enum(["PENDING", "APPROVED", "CONSUMED"]), expired: z.boolean(), stale: z.boolean(),
  requestedByViewer: z.boolean(), approvedByViewer: z.boolean() }).strict();
export const pageSchema = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item).max(50), nextCursor: id.nullable() }).strict();
export type ProjectSummaryDTO = z.infer<typeof projectSummaryDTOSchema>;
export type ProjectReadDTO = z.infer<typeof projectReadDTOSchema>;
export type QualificationDTO = z.infer<typeof qualificationDTOSchema>;
export type ReleaseRecordDTO = z.infer<typeof releaseRecordDTOSchema>;
export type ReleaseRequestDTO = z.infer<typeof releaseRequestDTOSchema>;
