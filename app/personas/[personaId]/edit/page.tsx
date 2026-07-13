import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { PersonaForm } from "@/features/persona/components/persona-form";
import { getPersona } from "@/features/persona/queries";
import { personaIdSchema } from "@/features/persona/schemas";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function EditPersonaPage({ params }: { params: Promise<{ personaId: string }> }) {
  const user = await requireUser();
  const { personaId } = await params;
  if (!personaIdSchema.safeParse(personaId).success) notFound();
  const persona = await getPersona(user.id, personaId);
  if (!persona) notFound();
  return <AppShell>
    <PageHeader
      back={<Link className="inline-flex min-h-11 items-center gap-2 rounded-control text-sm text-muted-foreground hover:text-foreground" href={`/personas/${persona.id}`}><ArrowLeft className="size-4" />返回人格详情</Link>}
      description="分区调整身份、性格、表达和高级边界；右侧预览只反映当前真实输入。"
      eyebrow="PERSONA BUILDER"
      title={`编辑 ${persona.name}`}
    />
    <div className="mt-8"><PersonaForm initial={persona} /></div>
  </AppShell>;
}
