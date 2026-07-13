import { Settings2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import type { ShellViewer } from "@/components/layout/shell-viewer";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { user, profile } = await requireAdmin();
  const viewer: ShellViewer = {
    avatarUrl: profile.avatarUrl ?? undefined,
    displayName: profile.displayName ?? undefined,
    email: profile.email ?? user.email ?? undefined,
    role: profile.role,
  };

  return (
    <AppShell mobileTitle="系统管理" variant="reading" viewer={viewer}>
      <PageHeader
        description="这里只展示已经实现并经过服务端管理员权限校验的管理能力。"
        eyebrow="ADMINISTRATION"
        title="系统管理"
      />
      <EmptyState
        className="mt-8"
        description="当前没有需要展示的管理项目；不会使用虚构图表或模拟数据填充页面。"
        icon={<Settings2 className="size-5" />}
        title="暂无可管理项目"
      />
    </AppShell>
  );
}
