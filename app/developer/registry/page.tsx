import type { Metadata } from "next";

import { RegistryWorkbench } from "@/features/developer-console/components/registry-workbench";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "开发者控制台 · Registry 只读" };

export default async function DeveloperRegistryPage() {
  await requireUser();
  return <RegistryWorkbench base="/developer/registry" mockHref="/developer" />;
}
