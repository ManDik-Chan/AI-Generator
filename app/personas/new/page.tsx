import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { PersonaCreation } from "@/features/persona/components/persona-creation";
import { getAiConfigurationStatus } from "@/lib/ai/config";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NewPersonaPage() {
  await requireUser();
  return <AppShell>
    <PageHeader
      back={<Link className="inline-flex min-h-11 items-center gap-2 rounded-control text-sm text-muted-foreground hover:text-foreground" href="/personas"><ArrowLeft className="size-4" />返回助手工作室</Link>}
      description="手动建立清晰的角色边界，或让 AI 先生成一份完全可编辑的结构化草稿。"
      eyebrow="PERSONA BUILDER"
      title="创建专属助手"
    />
    <div className="mt-8"><PersonaCreation aiConfigured={getAiConfigurationStatus().configured} /></div>
  </AppShell>;
}
