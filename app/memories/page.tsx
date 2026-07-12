import { AppShell } from "@/components/layout/app-shell";
import { MemoryManager } from "@/features/memory/components/memory-manager";
import { getMemoryPageData } from "@/features/memory/queries";
import { personaIdSchema } from "@/features/persona/schemas";
import { requireUser } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export default async function MemoriesPage({ searchParams }: { searchParams: Promise<{ personaId?: string }> }) { const user = await requireUser(); const data = await getMemoryPageData(user.id); const requested = (await searchParams).personaId; const initialPersonaId = requested && personaIdSchema.safeParse(requested).success && data.personas.some((persona) => persona.id === requested) ? requested : undefined; return <AppShell><div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium text-primary">可控记忆</p><h1 className="mt-1 text-2xl font-semibold">长期记忆</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">你可以控制 AI 长期保留哪些信息。只有启用的记忆才可能用于回答。</p></div></div><MemoryManager initialPersonaId={initialPersonaId} {...data} /></AppShell>; }
