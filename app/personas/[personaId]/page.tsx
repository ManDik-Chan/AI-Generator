import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PersonaHeaderClient } from "@/features/persona/components/persona-header-client";
import { getPersona } from "@/features/persona/queries";
import { personaIdSchema } from "@/features/persona/schemas";
import { requireUser } from "@/lib/auth/session";
import { getImageConfigurationStatus } from "@/lib/ai/image/config";

export const dynamic = "force-dynamic";

export default async function PersonaDetailPage({ params, searchParams }: { params: Promise<{ personaId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser(); const { personaId } = await params; if (!personaIdSchema.safeParse(personaId).success) notFound(); const persona = await getPersona(user.id, personaId); if (!persona) notFound(); const saved = (await searchParams).saved === "1";
  const sections = [["身份设定", persona.identity], ["性格", persona.personality], ["说话方式", persona.speakingStyle], ["擅长领域", persona.expertise], ["开场白", persona.greeting], ["高级补充指令", persona.systemPrompt]];
  return <AppShell>{saved && <p className="mb-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">人格已保存。</p>}<div className="rounded-2xl border bg-card p-5 sm:p-7"><PersonaHeaderClient imageConfigured={getImageConfigurationStatus().configured} persona={persona} /><div className="mt-7 grid gap-4 md:grid-cols-2">{sections.map(([label, content]) => content && <section className="min-w-0 rounded-xl bg-muted/60 p-4" key={label}><h2 className="text-sm font-semibold">{label}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{content}</p></section>)}</div></div></AppShell>;
}
