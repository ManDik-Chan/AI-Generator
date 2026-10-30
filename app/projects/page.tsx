import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { ProjectsIndex } from "@/features/platform/components/projects-index";
import { listMyProjects, listMyRuns } from "@/features/platform/source";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "项目" };

export default async function ProjectsPage() {
  await requireUser();
  return <AppShell mobileTitle="项目" variant="wide"><ProjectsIndex mode="live" projects={listMyProjects().data} runs={listMyRuns().data} /></AppShell>;
}
