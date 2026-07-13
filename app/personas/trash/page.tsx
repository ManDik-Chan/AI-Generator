import Link from "next/link";
import { ArrowLeft, ArchiveRestore } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PersonaTrashList } from "@/features/persona/components/persona-trash-list";
import { getPersonas } from "@/features/persona/queries";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PersonaTrashPage() {
  const user = await requireUser();
  const personas = await getPersonas(user.id, true);
  return <AppShell>
    <PageHeader
      description="这里的人格不会再出现在新对话助手列表中，但历史对话与原头像仍会保留。"
      eyebrow="ARCHIVED PERSONAS"
      primaryAction={<Button asChild variant="outline"><Link href="/personas"><ArrowLeft className="size-4" />返回助手列表</Link></Button>}
      title="人格回收站"
    />
    <div className="mt-8">{personas.length ? <PersonaTrashList personas={personas} /> : <EmptyState description="移至回收站的人格会安全地显示在这里。" icon={<ArchiveRestore className="size-6" />} title="回收站为空" />}</div>
  </AppShell>;
}
