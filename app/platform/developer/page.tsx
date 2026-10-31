import type { Metadata } from "next";

import { Workbench } from "@/features/developer-console/components/workbench";

export const metadata: Metadata = { title: "开发者控制台" };

export default function DemoDeveloperPage() {
  return <Workbench base="/platform/developer" projectsBase="/platform/projects" />;
}
