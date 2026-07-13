import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
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
  return <AppShell><div className="mb-6"><Link className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" href="/tools"><ArrowLeft className="size-4" />返回工具中心</Link><h1 className="mt-3 text-2xl font-semibold">工具历史</h1><p className="mt-2 text-sm text-muted-foreground">仅显示开启了历史保存的运行。打开记录不会重新调用模型。</p></div><ToolHistory filter={filter} items={history.items} page={history.page} pages={history.pages} /></AppShell>;
}
