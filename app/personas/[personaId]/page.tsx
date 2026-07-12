import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Pencil } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import { PersonaStatusActions } from "@/features/persona/components/persona-status-actions";
import { getPersona } from "@/features/persona/queries";
import { personaIdSchema } from "@/features/persona/schemas";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PersonaDetailPage({ params, searchParams }: { params: Promise<{ personaId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser(); const { personaId } = await params; if (!personaIdSchema.safeParse(personaId).success) notFound(); const persona = await getPersona(user.id, personaId); if (!persona) notFound(); const saved = (await searchParams).saved === "1";
  const sections = [["身份设定", persona.identity], ["性格", persona.personality], ["说话方式", persona.speakingStyle], ["擅长领域", persona.expertise], ["开场白", persona.greeting], ["高级补充指令", persona.systemPrompt]];
  return <AppShell>{saved && <p className="mb-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">人格已保存。</p>}<div className="rounded-2xl border bg-card p-5 sm:p-7"><div className="flex flex-col gap-5 sm:flex-row sm:items-start"><PersonaAvatar className="size-24" name={persona.name} src={persona.avatarUrl} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="break-words text-2xl font-semibold">{persona.name}</h1>{persona.archivedAt && <span className="rounded-full bg-muted px-2.5 py-1 text-xs">已归档</span>}</div><p className="mt-2 text-sm leading-6 text-muted-foreground">{persona.description || "暂无简介"}</p><div className="mt-4 flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/personas/${persona.id}/edit`}><Pencil className="size-4" />编辑</Link></Button>{!persona.archivedAt && <Button asChild><Link href={`/chat?personaId=${persona.id}`}><MessageCircle className="size-4" />开始对话</Link></Button>}</div></div></div><div className="mt-7 grid gap-4 md:grid-cols-2">{sections.map(([label, content]) => content && <section className="min-w-0 rounded-xl bg-muted/60 p-4" key={label}><h2 className="text-sm font-semibold">{label}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{content}</p></section>)}</div><div className="mt-6 border-t pt-5"><PersonaStatusActions archived={Boolean(persona.archivedAt)} personaId={persona.id} /></div></div></AppShell>;
}
