import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { ProjectConsole } from "@/features/platform/components/project-console";
import { getMyProject } from "@/features/platform/source";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: getMyProject(slug).data?.name ?? "项目" };
}

export default async function ProjectConsolePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const project = getMyProject(slug).data;
  if (!project) notFound();
  return <AppShell mobileTitle={project.name} variant="wide"><ProjectConsole mode="live" project={project} /></AppShell>;
}
