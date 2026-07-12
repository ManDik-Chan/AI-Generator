import { AppShell } from "@/components/layout/app-shell";
import { PersonaForm } from "@/features/persona/components/persona-form";
import { requireUser } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export default async function NewPersonaPage() { await requireUser(); return <AppShell><div className="mb-6"><h1 className="text-2xl font-semibold">创建人格</h1><p className="mt-1 text-sm text-muted-foreground">本阶段仅手动创建，不会调用 AI 生成人格。</p></div><PersonaForm /></AppShell>; }
