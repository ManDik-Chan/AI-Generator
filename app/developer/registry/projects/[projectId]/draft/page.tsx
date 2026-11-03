import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DraftEditorDesk } from "@/features/developer-console/components/registry-draft-editor";
import { isUuid } from "@/features/developer-console/registry/contract";
import { requireUser } from "@/lib/auth/session";

type Props = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Registry · 编辑草稿" };

// Same as the project page: only the ID's shape is checked here. Access and every save are decided by
// the Registry API in the browser, with the user's own Bearer token.
export default async function DeveloperRegistryDraftPage({ params }: Props) {
  await requireUser();
  const { projectId } = await params;
  if (!isUuid(projectId)) notFound();
  return <DraftEditorDesk base="/developer/registry" projectId={projectId.toLowerCase()} />;
}
