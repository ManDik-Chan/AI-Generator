import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResearchProjectView } from "@/features/research/components/research-project-view";
import { getResearchProject, linkedShowcaseProject, researchProjectSlugs } from "@/features/research/source";

type Props = { params: Promise<{ slug: string }> };

// Only fixture research projects exist; every other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return researchProjectSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = getResearchProject((await params).slug).data;
  if (!project) return { title: "研究项目" };
  return { title: project.title, description: project.question };
}

export default async function ResearchProjectPage({ params }: Props) {
  const project = getResearchProject((await params).slug).data;
  if (!project) notFound();
  return <ResearchProjectView project={project} showcase={linkedShowcaseProject(project)} />;
}
