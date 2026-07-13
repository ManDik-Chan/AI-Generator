import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Settings2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export default async function AdminPage() { const { profile } = await requireAdmin(); return <AppShell mobileTitle="系统管理" variant="reading"><PageHeader description={`当前管理员：${profile.displayName ?? profile.email}`} eyebrow="管理员" title="系统管理" /><EmptyState className="mt-8" description="模型配置、用户管理和系统设置将在对应功能准备好后显示。" icon={<Settings2 className="size-5" />} title="暂无可管理项目" /></AppShell>; }
