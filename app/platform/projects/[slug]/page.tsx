import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectConsole } from "@/features/platform/components/project-console";
import { getMyProject, myProjectSlugs } from "@/features/platform/source";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return myProjectSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: getMyProject((await params).slug).data?.name ?? "项目" };
}

export default async function DemoProjectConsolePage({ params }: Props) {
  const project = getMyProject((await params).slug).data;
  if (!project) notFound();
  return <ProjectConsole mode="demo" project={project} />;
}
