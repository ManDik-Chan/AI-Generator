import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { PersonaTrashList } from "@/features/persona/components/persona-trash-list";
import { getPersonas } from "@/features/persona/queries";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export default async function PersonaTrashPage() {
  const user = await requireUser(); const personas = await getPersonas(user.id, true);
  return <AppShell><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">回收站中的人格</h1><p className="mt-1 text-sm text-muted-foreground">恢复后，人格会重新出现在助手选择栏中。</p></div><Button asChild variant="outline"><Link href="/personas"><ArrowLeft className="size-4" />返回人格列表</Link></Button></div><div className="mt-6">{personas.length ? <PersonaTrashList personas={personas} /> : <div className="rounded-2xl border border-dashed p-10 text-center"><h2 className="font-semibold">回收站为空</h2><p className="mt-2 text-sm text-muted-foreground">移至回收站的人格会显示在这里。</p></div>}</div></AppShell>;
}
