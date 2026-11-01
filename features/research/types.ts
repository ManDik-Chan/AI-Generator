/*
 * Research Lab domain types (P1-D2-B).
 *
 * A research project owns its claims and experiment records. It may point at a Showcase
 * project (`showcaseSlug`); when it does, its claim topics and statuses must match the
 * Showcase page (a unit test checks), so one claim never has two different states.
 * Nothing here is a database model: there is no Research Lab API yet. See
 * docs/handoffs/2026-10-31-claude-research-lab-d2b.md for the interface this data stands in for.
 */
import type { ClaimStatus, Provenance } from "@/features/platform/types";
import type { ReplayKind } from "@/features/research/replays";
import type { RequirementId } from "@/features/research/requirements";

/**
 * - REPRODUCIBLE: deterministic; the reference result is computed from repository code when
 *   the page is built, and the visitor's browser can recompute it.
 * - TEST_COVERED: checked by automated tests in the repository; the page does not run them.
 * - PLANNED: a protocol only. Never executed, so there is no result.
 * - BLOCKED: cannot run until the platform provides a capability it does not have yet.
 */
export type ExperimentStatus = "REPRODUCIBLE" | "TEST_COVERED" | "PLANNED" | "BLOCKED";

/** Where the experiment executes. Only "browser" can run from a public page. */
export type ExecutionSite = "browser" | "ci" | "server" | "gpu";

export type EvidenceKind = "source" | "test" | "doc" | "asset";

/**
 * - open: a repository file or a page on this site that anyone can read now.
 * - pending: an evidence asset the Registry cannot deliver yet (L-1, L-2).
 * - sample: part of a hand-written sample project; there is nothing to open.
 */
export type EvidenceAvailability = "open" | "pending" | "sample";

export interface EvidenceItem {
  kind: EvidenceKind;
  label: string;
  /** Repository path for source and test, a site path for doc. Absent for pending and sample items. */
  ref?: string;
  availability: EvidenceAvailability;
  note?: string;
}

export interface ResearchClaim {
  /** Stable within its project; used in links (#claim-<id>). */
  id: string;
  topic: string;
  status: ClaimStatus;
  statement: string;
  evidence: EvidenceItem[];
}

export interface ExperimentParameter {
  name: string;
  value: string;
}

export interface ExperimentRecord {
  /** Display id, e.g. "ROUTE-01". Its lower-case form is the URL segment. */
  id: string;
  title: string;
  objective: string;
  /** Claims this experiment tests. */
  claimIds: string[];
  status: ExperimentStatus;
  site: ExecutionSite;
  protocol: {
    version: string;
    /** Date the protocol was written (YYYY-MM-DD). Not a run date. */
    defined: string;
  };
  method: string[];
  parameters: ExperimentParameter[];
  environment: {
    runtime: string;
    /** Code the experiment executes: repository paths and exported symbols. */
    entry: { path: string; symbol: string }[];
    dependencies: { name: string; version: string }[];
    randomness: string;
  };
  reproducibility: {
    level: "exact" | "tolerance" | "tests" | "none";
    detail: string;
    /** Command that reproduces it from a checkout of the repository. */
    command?: string;
  };
  /** Pass / fail rule, fixed in the protocol. */
  criterion?: string;
  /** Present exactly when status is REPRODUCIBLE. */
  replay?: ReplayKind;
  /** Present for PLANNED and BLOCKED: why there is no result and what would unblock it. */
  pending?: { reason: string; requires: RequirementId[] };
  limitations: string[];
  evidence: EvidenceItem[];
}

export interface ResearchProject {
  slug: string;
  title: string;
  /** The research question, one or two sentences. */
  question: string;
  summary: string;
  provenance: Provenance;
  /** Explore slug of the related Showcase project, if any. */
  showcaseSlug?: string;
  approach: { title: string; body: string }[];
  claims: ResearchClaim[];
  experiments: ExperimentRecord[];
}
