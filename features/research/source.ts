/*
 * Data interface of the Research Lab. Pages only talk to this module.
 *
 * Today every function resolves to the fixtures in fixtures.ts and reports
 * `source: "fixture"`. When a Research Lab read API exists (L-6 in requirements.ts), replace
 * the bodies; the components take the same shapes. Reference results are not data: they
 * are computed from repository code by `referenceOutcome`, on the server, at render time.
 */
import { REPO_URL } from "@/features/demos/catalog";
import { getPublicProject } from "@/features/platform/source";
import type { PlatformProject } from "@/features/platform/types";
import { researchProjects } from "@/features/research/fixtures";
import { experimentSegment } from "@/features/research/labels";
import { runReplay, type ReplayOutcome } from "@/features/research/replays";
import type { ExecutionSite, ExperimentRecord, ExperimentStatus, ResearchClaim, ResearchProject } from "@/features/research/types";

export interface ResearchSourced<T> {
  data: T;
  source: "fixture";
}

const fixture = <T,>(data: T): ResearchSourced<T> => ({ data, source: "fixture" });

export function listResearchProjects(): ResearchSourced<ResearchProject[]> {
  return fixture([...researchProjects]);
}

export function getResearchProject(slug: string): ResearchSourced<ResearchProject | undefined> {
  return fixture(researchProjects.find((project) => project.slug === slug));
}

export function researchProjectSlugs(): string[] {
  return researchProjects.map((project) => project.slug);
}

export function researchHref(slug: string) {
  return `/research/${slug}`;
}

export function experimentHref(projectSlug: string, experimentId: string) {
  return `/research/${projectSlug}/${experimentSegment(experimentId)}`;
}

export function claimHref(projectSlug: string, claimId: string) {
  return `/research/${projectSlug}#claim-${claimId}`;
}

export function getExperiment(slug: string, segment: string): { project: ResearchProject; experiment: ExperimentRecord } | undefined {
  const project = getResearchProject(slug).data;
  const experiment = project?.experiments.find((item) => experimentSegment(item.id) === segment);
  return project && experiment ? { project, experiment } : undefined;
}

export function experimentParams(): { slug: string; experiment: string }[] {
  return researchProjects.flatMap((project) => project.experiments.map((experiment) => ({ slug: project.slug, experiment: experimentSegment(experiment.id) })));
}

/** The Research Lab page for a Showcase project, if one exists. */
export function researchHrefForShowcase(showcaseSlug: string): string | undefined {
  const project = researchProjects.find((item) => item.showcaseSlug === showcaseSlug);
  return project ? researchHref(project.slug) : undefined;
}

/** The public Showcase project a research project links to (PRIVATE projects are never returned). */
export function linkedShowcaseProject(project: ResearchProject): PlatformProject | undefined {
  return project.showcaseSlug ? getPublicProject(project.showcaseSlug).data : undefined;
}

export function experimentsForClaim(project: ResearchProject, claimId: string): ExperimentRecord[] {
  return project.experiments.filter((experiment) => experiment.claimIds.includes(claimId));
}

export function claimsForExperiment(project: ResearchProject, experiment: ExperimentRecord): ResearchClaim[] {
  return experiment.claimIds.map((id) => project.claims.find((claim) => claim.id === id)).filter((claim): claim is ResearchClaim => Boolean(claim));
}

/** Reference result of a REPRODUCIBLE experiment, computed now from repository code. */
export function referenceOutcome(experiment: ExperimentRecord): ReplayOutcome | undefined {
  return experiment.replay ? runReplay(experiment.replay) : undefined;
}

export interface Verdict {
  passed: number;
  total: number;
}

export function verdictOf(outcome: ReplayOutcome): Verdict {
  return { passed: outcome.checks.filter((check) => check.pass).length, total: outcome.checks.length };
}

/** Serializable row for the experiment directory (the client filter receives these). */
export interface ExperimentSummary {
  id: string;
  title: string;
  href: string;
  status: ExperimentStatus;
  site: ExecutionSite;
  projectSlug: string;
  projectTitle: string;
  claimTopics: string[];
  verdict?: Verdict;
}

export function summarizeExperiment(project: ResearchProject, experiment: ExperimentRecord): ExperimentSummary {
  const reference = referenceOutcome(experiment);
  return {
    id: experiment.id,
    title: experiment.title,
    href: experimentHref(project.slug, experiment.id),
    status: experiment.status,
    site: experiment.site,
    projectSlug: project.slug,
    projectTitle: project.title,
    claimTopics: claimsForExperiment(project, experiment).map((claim) => claim.topic),
    verdict: reference ? verdictOf(reference) : undefined,
  };
}

export function listExperimentSummaries(): ExperimentSummary[] {
  return researchProjects.flatMap((project) => project.experiments.map((experiment) => summarizeExperiment(project, experiment)));
}

/**
 * Commit the page was built from, when the deployment provides it. Server-only by design:
 * the value is read while rendering and passed down as text.
 */
export function buildRevision(): string | undefined {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  return sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha : undefined;
}

/** Link to a repository file at the built commit when known, otherwise main. */
export function repoFileUrl(path: string) {
  return `${REPO_URL}/blob/${buildRevision() ?? "main"}/${path}`;
}

export function commitUrl(sha: string) {
  return `${REPO_URL}/commit/${sha}`;
}
