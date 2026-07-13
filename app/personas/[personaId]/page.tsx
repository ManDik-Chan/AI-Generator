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
  return <AppShell>{saved && <p className="mb-5 rounded-control border border-success/15 bg-success-subtle p-3 text-sm text-success-foreground">人格已保存。</p>}<div className="premium-panel-strong relative overflow-hidden p-5 sm:p-8"><div className="absolute right-0 top-0 size-72 rounded-full bg-primary/8 blur-3xl" /><div className="relative"><PersonaHeaderClient imageConfigured={getImageConfigurationStatus().configured} persona={persona} /><div className="mt-8 grid gap-4 md:grid-cols-2">{sections.map(([label, content]) => content && <section className="premium-subpanel min-w-0 p-4 sm:p-5" key={label}><p className="premium-kicker">{label}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{content}</p></section>)}</div></div></div></AppShell>;
}
