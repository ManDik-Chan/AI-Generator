/*
 * Reserved data interface for the platform modules (Explore, Projects, Developer,
 * Connections). Pages only talk to this module.
 *
 * Today every function resolves to fixtures and reports `source: "demo"`, so pages can
 * label themselves honestly. When the Registry API (P1-B) and the Grant / Credential
 * services exist, replace the function bodies; the page components and their props do
 * not change. Visibility rules here mirror the contract: PRIVATE projects are never
 * returned to the public surface, UNLISTED projects are reachable by slug but not listed.
 */
import { platformProjects, sampleCredentials, sampleGrants } from "@/features/platform/fixtures";
import type { PlatformProject, ProjectGrant, ProviderCredential, ProjectRun } from "@/features/platform/types";

export interface Sourced<T> {
  data: T;
  source: "demo" | "registry";
}

const demo = <T,>(data: T): Sourced<T> => ({ data, source: "demo" });

/** Projects shown in the public Explore directory: PUBLIC only. */
export function listPublicProjects(): Sourced<PlatformProject[]> {
  return demo(platformProjects.filter((project) => project.visibility === "PUBLIC"));
}

/** A public showcase page: PUBLIC and UNLISTED are reachable, PRIVATE is not found. */
export function getPublicProject(slug: string): Sourced<PlatformProject | undefined> {
  const project = platformProjects.find((item) => item.slug === slug);
  return demo(project && project.visibility !== "PRIVATE" ? project : undefined);
}

/** Every slug that may be prerendered as a public page. */
export function publicProjectSlugs(): string[] {
  return platformProjects.filter((project) => project.visibility !== "PRIVATE").map((project) => project.slug);
}

/** Projects the viewer belongs to ("我的项目"). */
export function listMyProjects(): Sourced<PlatformProject[]> {
  return demo(platformProjects.filter((project) => project.ownedByViewer));
}

export function getMyProject(slug: string): Sourced<PlatformProject | undefined> {
  return demo(platformProjects.find((project) => project.ownedByViewer && project.slug === slug));
}

export function myProjectSlugs(): string[] {
  return platformProjects.filter((project) => project.ownedByViewer).map((project) => project.slug);
}

export interface WorkspaceRun extends ProjectRun {
  project: string;
  projectSlug: string;
}

/** Runs across the viewer's projects, newest first as written in the fixtures. */
export function listMyRuns(): Sourced<WorkspaceRun[]> {
  return demo(
    platformProjects
      .filter((project) => project.ownedByViewer)
      .flatMap((project) => project.runs.map((run) => ({ ...run, project: project.name, projectSlug: project.slug }))),
  );
}

export function listGrants(): Sourced<ProjectGrant[]> {
  return demo([...sampleGrants]);
}

export function listCredentials(): Sourced<ProviderCredential[]> {
  return demo([...sampleCredentials]);
}
