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
        description={<><p>AI 会把可能长期有用的信息作为建议交给你确认；确认前不会用于未来对话。5B1 以前的旧版自动记忆会明确标记为“旧版未复核”，并暂时继续按当前设置参与召回。</p><p className="mt-2 text-xs">正式记忆是唯一召回真相源。启用语义召回时，正式记忆整理文本和当前问题可能发送到配置的 Embedding Provider；向量只保存在当前项目数据库中，不返回浏览器，也不与其他用户共享。</p></>}
        eyebrow="TRUSTED MEMORY"
        title="AI 记忆库"
      />
      <div className="mt-8">
      <MemoryManager initialPersonaId={initialPersonaId} {...data} />
      </div>
    </AppShell>
  );
}
