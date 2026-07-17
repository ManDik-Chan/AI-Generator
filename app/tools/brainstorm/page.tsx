import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { BrainstormWorkspace } from "@/features/tools/brainstorm/brainstorm-workspace";
import { getBrainstormUsage } from "@/features/tools/usage";
import { getBrainstormConfigurationStatus, getBrainstormDailyLimit } from "@/lib/ai/config";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function BrainstormPage() {
  const user = await requireUser();
  const configured = getBrainstormConfigurationStatus().configured;
  const usage = await getBrainstormUsage(user.id, getBrainstormDailyLimit());

  return <AppShell>
    <PageHeader
      back={<Link className="inline-flex min-h-11 items-center gap-2 rounded-control text-sm text-muted-foreground hover:text-foreground" href="/tools"><ArrowLeft className="size-4" />返回工具中心</Link>}
      description="每次运行由四个固定 Worker 独立分析，再由协调器综合。不会读取聊天、Persona 或长期记忆，不联网搜索；结果只基于你的输入和模型已有知识。切到手机后台后，任务会在平台执行时限内继续。"
      eyebrow="PRIVATE MULTI-AGENT WORKSPACE"
      primaryAction={<Button asChild variant="outline"><Link href="/tools/history?type=BRAINSTORM"><History className="size-4" />头脑风暴历史</Link></Button>}
      title="多 Agent 头脑风暴"
    />
    <div className="mt-8"><BrainstormWorkspace configured={configured} initialUsage={usage} /></div>
  </AppShell>;
}
