import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PersonaForm } from "@/features/persona/components/persona-form";
import { getPersona } from "@/features/persona/queries";
import { personaIdSchema } from "@/features/persona/schemas";
import { requireUser } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export default async function EditPersonaPage({ params }: { params: Promise<{ personaId: string }> }) { const user = await requireUser(); const { personaId } = await params; if (!personaIdSchema.safeParse(personaId).success) notFound(); const persona = await getPersona(user.id, personaId); if (!persona) notFound(); return <AppShell><div className="mb-6"><h1 className="text-2xl font-semibold">编辑人格</h1><p className="mt-1 text-sm text-muted-foreground">回收站中的人格也可以编辑，恢复后会重新进入选择器。</p></div><PersonaForm initial={persona} /></AppShell>; }
