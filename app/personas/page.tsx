import Link from "next/link";
import { Plus, Sparkles, Trash2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBanner } from "@/components/ui/status-banner";
import { PersonaList } from "@/features/persona/components/persona-list";
import { getPersonas } from "@/features/persona/queries";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PersonasPage({ searchParams }: { searchParams: Promise<{ trashed?: string }> }) {
  const user = await requireUser();
  const personas = await getPersonas(user.id, false);
  const trashed = (await searchParams).trashed === "1";

  return (
    <AppShell>
      {trashed && <StatusBanner className="mb-5" title="已移至回收站" variant="success">人格已从新对话助手列表中移除，已有历史对话仍会保留。</StatusBanner>}
      <PageHeader
        description="创建只属于你的 AI 角色、表达方式与专业边界。每个人格都可以独立聊天和管理记忆。"
        eyebrow="PERSONA STUDIO"
        primaryAction={<Button asChild><Link href="/personas/new"><Plus className="size-4" />创建助手</Link></Button>}
        secondaryAction={<Button asChild variant="outline"><Link href="/personas/trash"><Trash2 className="size-4" />回收站</Link></Button>}
        title="我的私人助手"
      />
      <div className="mt-8">
        {personas.length ? <PersonaList personas={personas} /> : (
          <EmptyState
            action={<Button asChild><Link href="/personas/new"><Plus className="size-4" />创建第一个助手</Link></Button>}
            description="从身份、性格和表达方式开始，建立一个真正适合你的 AI 助手。"
            icon={<Sparkles className="size-6" />}
            title="还没有私人助手"
          />
        )}
      </div>
    </AppShell>
  );
}
