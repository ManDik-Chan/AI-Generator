import type { Metadata } from "next";

import { ProjectsIndex } from "@/features/platform/components/projects-index";
import { listMyProjects, listMyRuns } from "@/features/platform/source";

export const metadata: Metadata = { title: "项目" };

export default function DemoProjectsPage() {
  return <ProjectsIndex mode="demo" projects={listMyProjects().data} runs={listMyRuns().data} />;
}
