import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { PersonaList } from "@/features/persona/components/persona-list";
import { getPersonas } from "@/features/persona/queries";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export default async function PersonasPage({ searchParams }: { searchParams: Promise<{ trashed?: string }> }) {
  const user = await requireUser(); const personas = await getPersonas(user.id, false); const trashed = (await searchParams).trashed === "1";
  return <AppShell>{trashed && <p className="mb-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">人格已移至回收站</p>}<div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">我的人格</h1><p className="mt-1 text-sm text-muted-foreground">创建只属于你的 AI 角色与表达方式。</p></div><div className="flex gap-2"><Button asChild variant="outline"><Link href="/personas/trash"><Trash2 className="size-4" />回收站</Link></Button><Button asChild><Link href="/personas/new"><Plus className="size-4" />新建人格</Link></Button></div></div><div className="mt-6">{personas.length ? <PersonaList personas={personas} /> : <div className="rounded-2xl border border-dashed p-10 text-center"><h2 className="font-semibold">还没有人格</h2><p className="mt-2 text-sm text-muted-foreground">创建一个人格，为新对话设定身份、性格和说话方式。</p><Button asChild className="mt-5"><Link href="/personas/new">创建第一个人格</Link></Button></div>}</div></AppShell>;
}
