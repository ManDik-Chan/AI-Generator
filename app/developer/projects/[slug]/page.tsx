import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReleaseDesk } from "@/features/developer-console/components/release-desk";
import { consoleProjectName } from "@/features/developer-console/mock/seed";
import { requireUser } from "@/lib/auth/session";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `发布台 · ${consoleProjectName((await params).slug) ?? "项目"}` };
}

export default async function ReleaseDeskPage({ params }: Props) {
  await requireUser();
  const { slug } = await params;
  if (!consoleProjectName(slug)) notFound();
  return <ReleaseDesk base="/developer" projectsBase="/projects" slug={slug} />;
}
