import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { ToolHistory } from "@/features/tools/components/tool-history";
import { getToolHistory } from "@/features/tools/queries";
import { toolHistoryFilterSchema } from "@/features/tools/schemas";
import { recoverStaleToolRuns } from "@/features/tools/usage";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ToolHistoryPage({ searchParams }: { searchParams: Promise<{ page?: string; type?: string }> }) {
  const user = await requireUser();
  await recoverStaleToolRuns(user.id);
  const search = await searchParams;
  const page = Math.max(1, Number.parseInt(search.page || "1", 10) || 1);
  const parsedType = toolHistoryFilterSchema.safeParse(search.type || "ALL");
  const filter = parsedType.success ? parsedType.data : "ALL";
  const history = await getToolHistory(user.id, page, filter === "ALL" ? undefined : filter);
  return <AppShell>
    <PageHeader
      back={<Link className="inline-flex min-h-11 items-center gap-2 rounded-control text-sm text-muted-foreground hover:text-foreground" href="/tools"><ArrowLeft className="size-4" />返回工具中心</Link>}
      description="只显示开启了历史保存的真实运行；打开、复制和下载记录都不会重新调用模型。"
      eyebrow="PRIVATE ACTIVITY"
      title="工具历史"
    />
    <div className="mt-8"><ToolHistory filter={filter} items={history.items} page={history.page} pages={history.pages} /></div>
  </AppShell>;
}
