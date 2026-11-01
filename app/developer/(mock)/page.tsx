import type { Metadata } from "next";

import { Workbench } from "@/features/developer-console/components/workbench";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "开发者控制台" };

export default async function DeveloperPage() {
  await requireUser();
  return <Workbench base="/developer" projectsBase="/projects" />;
}
