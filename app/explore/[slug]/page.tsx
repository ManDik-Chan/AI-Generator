import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectShowcase } from "@/features/platform/components/showcase";
import { getPublicProject, listPublicProjects, publicProjectSlugs } from "@/features/platform/source";

type Props = { params: Promise<{ slug: string }> };

// Only PUBLIC and UNLISTED projects are prerendered; any other slug (including private ones) is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return publicProjectSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = getPublicProject((await params).slug).data;
  if (!project) return { title: "项目" };
  return {
    title: project.name,
    description: project.summary,
    robots: project.visibility === "UNLISTED" ? { index: false, follow: false } : undefined,
  };
}

export default async function ProjectShowcasePage({ params }: Props) {
  const project = getPublicProject((await params).slug).data;
  if (!project) notFound();
  const related = listPublicProjects().data.filter((item) => item.slug !== project.slug).slice(0, 3);
  return <ProjectShowcase project={project} related={related} />;
}
