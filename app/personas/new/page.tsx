import { AppShell } from "@/components/layout/app-shell";
import { PersonaCreation } from "@/features/persona/components/persona-creation";
import { getAiConfigurationStatus } from "@/lib/ai/config";
import { requireUser } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export default async function NewPersonaPage() { await requireUser(); return <AppShell><div className="mb-6"><h1 className="text-2xl font-semibold">创建人格</h1><p className="mt-1 text-sm text-muted-foreground">可以手动填写，或让 AI 生成一份可继续修改的结构化草稿。</p></div><PersonaCreation aiConfigured={getAiConfigurationStatus().configured} /></AppShell>; }
