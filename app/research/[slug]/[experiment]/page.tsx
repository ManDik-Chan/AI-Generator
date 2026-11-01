import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ExperimentView } from "@/features/research/components/experiment-view";
import { experimentParams, getExperiment, linkedShowcaseProject } from "@/features/research/source";

type Props = { params: Promise<{ slug: string; experiment: string }> };

// Only fixture experiment records exist; every other path is a 404. Reference results are
// computed while these pages are prerendered at build time.
export const dynamicParams = false;

export function generateStaticParams() {
  return experimentParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, experiment } = await params;
  const found = getExperiment(slug, experiment);
  if (!found) return { title: "实验记录" };
  return { title: `${found.experiment.id} ${found.experiment.title}`, description: found.experiment.objective };
}

export default async function ExperimentPage({ params }: Props) {
  const { slug, experiment } = await params;
  const found = getExperiment(slug, experiment);
  if (!found) notFound();
  return <ExperimentView experiment={found.experiment} project={found.project} showcase={linkedShowcaseProject(found.project)} />;
}
