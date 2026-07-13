import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { MemoryManager } from "@/features/memory/components/memory-manager";
import { getMemoryPageData } from "@/features/memory/queries";
import { personaIdSchema } from "@/features/persona/schemas";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function MemoriesPage({ searchParams }: { searchParams: Promise<{ personaId?: string }> }) {
  const user = await requireUser();
  const data = await getMemoryPageData(user.id);
  const requested = (await searchParams).personaId;
  const initialPersonaId = requested && personaIdSchema.safeParse(requested).success && data.personas.some((persona) => persona.id === requested) ? requested : undefined;

  return (
    <AppShell>
      <PageHeader
        description={<><p>AI 会在对话中自动整理可能长期有用的信息；你始终可以查看、修改、停用或删除。</p><p className="mt-2 text-xs">启用语义召回时，整理文本和当前问题可能发送到配置的 Embedding Provider；向量只保存在当前项目数据库中，不返回浏览器，也不与其他用户共享。</p></>}
        eyebrow="TRUSTED MEMORY"
        title="AI 记忆库"
      />
      <div className="mt-8">
      <MemoryManager initialPersonaId={initialPersonaId} {...data} />
      </div>
    </AppShell>
  );
}
