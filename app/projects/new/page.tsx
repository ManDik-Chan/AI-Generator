import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { NewProjectWizard } from "@/features/platform/components/new-project-wizard";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "新建项目" };

export default async function NewProjectPage() {
  await requireUser();
  return <AppShell mobileTitle="新建项目" variant="wide"><NewProjectWizard base="/projects" /></AppShell>;
}
