import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBanner } from "@/components/ui/status-banner";
import { TOOL_LABELS } from "@/features/tools/constants";
import { ToolRunner } from "@/features/tools/components/tool-runner";
import type { TextToolTypeValue } from "@/features/tools/types";

export function ToolPage({ tool, aiConfigured, description }: { tool: TextToolTypeValue; aiConfigured: boolean; description: string }) {
  return <AppShell>
    <PageHeader
      back={<Link className="inline-flex min-h-11 items-center gap-2 rounded-control text-sm text-muted-foreground hover:text-foreground" href="/tools"><ArrowLeft className="size-4" />返回工具中心</Link>}
      description={description}
      eyebrow="TEXT WORKBENCH"
      primaryAction={<Button asChild variant="outline"><Link href="/tools/history"><History className="size-4" />工具历史</Link></Button>}
      title={TOOL_LABELS[tool]}
    />
    {!aiConfigured && <StatusBanner className="mt-6" title="AI 工具服务尚未配置" variant="warning">页面仍可查看，提交时会显示明确配置提示，不会产生通用 500。</StatusBanner>}
    <div className="mt-8"><ToolRunner aiConfigured={aiConfigured} tool={tool} /></div>
  </AppShell>;
}
