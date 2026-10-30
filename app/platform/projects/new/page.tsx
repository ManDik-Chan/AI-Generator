import type { Metadata } from "next";

import { NewProjectWizard } from "@/features/platform/components/new-project-wizard";

export const metadata: Metadata = { title: "新建项目" };

export default function DemoNewProjectPage() {
  return <NewProjectWizard base="/platform/projects" />;
}
