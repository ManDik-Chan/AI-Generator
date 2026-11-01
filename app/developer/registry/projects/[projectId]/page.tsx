import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RegistryProjectDesk } from "@/features/developer-console/components/registry-project";
import { isUuid } from "@/features/developer-console/registry/contract";
import { requireUser } from "@/lib/auth/session";

type Props = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Registry 只读 · 项目" };

// The page only checks the ID's shape. Whether the project exists or the user may read it is
// decided by the read API in the browser, with the user's own Bearer token.
export default async function DeveloperRegistryProjectPage({ params }: Props) {
  await requireUser();
  const { projectId } = await params;
  if (!isUuid(projectId)) notFound();
  return <RegistryProjectDesk base="/developer/registry" mockHref="/developer" projectId={projectId.toLowerCase()} />;
}
