import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReleaseDesk } from "@/features/developer-console/components/release-desk";
import { consoleProjectName, consoleProjectSlugs } from "@/features/developer-console/mock/seed";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return consoleProjectSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `发布台 · ${consoleProjectName((await params).slug) ?? "项目"}` };
}

export default async function DemoReleaseDeskPage({ params }: Props) {
  const { slug } = await params;
  if (!consoleProjectName(slug)) notFound();
  return <ReleaseDesk base="/platform/developer" projectsBase="/platform/projects" slug={slug} />;
}
