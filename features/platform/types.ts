/*
 * Platform domain types. Field names and states follow the P0.5 Registry contract
 * (docs/platform/p05/contracts on the platform-p05 branch) and the run lifecycle in
 * the platform roadmap. Nothing here is a database model: the Registry is not deployed.
 */
import type { ArtKey } from "@/features/landing/art";
import type { CapabilityStatus } from "@/features/platform/status";

export type Visibility = "PRIVATE" | "UNLISTED" | "PUBLIC";
export type DraftState = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "ARCHIVED";
export type AssetState = "QUARANTINED" | "VALIDATED" | "APPROVED" | "RETIRED" | "REJECTED";
export type ProjectRole = "OWNER" | "EDITOR" | "REVIEWER" | "PUBLISHER" | "VIEWER";
export type IntegrationMode = "SHOWCASE" | "EMBED" | "REMOTE_API";
/** Category enum of the P0.5 manifest schema. */
export type ProjectCategory = "research" | "software" | "algorithm" | "web-service" | "ai" | "other";
/** Research claim status of the P0.5 manifest schema. */
export type ClaimStatus = "SOURCE_IMPLEMENTED" | "DOCUMENTED" | "EXPERIMENT_VERIFIED" | "PLANNED";
/** Run lifecycle from the platform roadmap (POST /runs → 202 Accepted). */
export type RunStatus = "PENDING" | "ACCEPTED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "TIMED_OUT";
/** "real" content describes something that exists; "sample" content is written for the demo. */
export type Provenance = "real" | "sample";
export type LabKind = "volume" | "sorting" | "hub" | "api";
export type DataFlow = "none" | "platform" | "developer";

export interface ProjectCapability {
  id: string;
  label: string;
  status: CapabilityStatus;
  detail: string;
  /** Where a user's input goes when this capability runs. */
  dataFlow: DataFlow;
}

export interface ProjectClaim {
  topic: string;
  status: ClaimStatus;
  description: string;
}

export interface ProjectSection {
  title: string;
  body: string;
}

export interface ArchitectureLayer {
  name: string;
  items: string[];
  planned?: boolean;
}

export interface BenchmarkMetric {
  name: string;
  dataset: string;
  /** UNPUBLISHED and REPORTED come from the presentation schema; COMPUTED_LIVE is measured in the visitor's browser. */
  status: "UNPUBLISHED" | "REPORTED" | "COMPUTED_LIVE";
  note?: string;
}

export interface ProjectDoc {
  title: string;
  kind: "guide" | "reference" | "model-card" | "data" | "changelog";
  language: string;
  summary: string;
  href?: string;
}

export interface ProjectRelease {
  version: string;
  state: "PUBLISHED" | "WITHDRAWN" | "IN_REVIEW";
  date: string;
  title: string;
  notes: string[];
  href?: string;
}

export interface ProjectMember {
  name: string;
  roles: ProjectRole[];
}

export interface ProjectAsset {
  name: string;
  mime: string;
  size: string;
  state: AssetState;
  dataClass: "SYNTHETIC" | "PUBLIC" | "PRIVATE";
}

export interface ProjectRun {
  id: string;
  capability: string;
  status: RunStatus;
  started: string;
  duration: string;
  actor: string;
  note?: string;
}

export interface PlatformProject {
  slug: string;
  name: string;
  tagline: string;
  summary: string;
  category: ProjectCategory;
  owner: string;
  visibility: Visibility;
  draftState: DraftState;
  /** Semver for registry projects; a commit reference for the platform itself. */
  version: string;
  integration: IntegrationMode;
  art: ArtKey;
  provenance: Provenance;
  updated: string;
  tags: string[];
  capabilities: ProjectCapability[];
  claims: ProjectClaim[];
  overview: ProjectSection[];
  architecture: ArchitectureLayer[];
  benchmarks: BenchmarkMetric[];
  docs: ProjectDoc[];
  releases: ProjectRelease[];
  members: ProjectMember[];
  assets: ProjectAsset[];
  runs: ProjectRun[];
  lab?: LabKind;
  links?: { label: string; href: string }[];
  /** True when the demo viewer owns the project ("我的项目"). */
  ownedByViewer: boolean;
}

export interface ProjectGrant {
  id: string;
  project: string;
  projectSlug: string;
  capability: string;
  scope: string;
  expires: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  dataFlow: DataFlow;
}

export interface ProviderCredential {
  id: string;
  provider: string;
  label: string;
  hint: string;
  models: string[];
  scope: string;
  status: "ACTIVE" | "DISABLED";
}
