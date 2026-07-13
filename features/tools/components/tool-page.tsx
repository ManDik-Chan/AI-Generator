import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { TOOL_LABELS } from "@/features/tools/constants";
import { ToolRunner } from "@/features/tools/components/tool-runner";
import type { ToolTypeValue } from "@/features/tools/types";

export function ToolPage({ tool, aiConfigured, description }: { tool: ToolTypeValue; aiConfigured: boolean; description: string }) {
  return <AppShell><div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><Link className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" href="/tools"><ArrowLeft className="size-4" />返回工具中心</Link><h1 className="mt-3 text-2xl font-semibold">{TOOL_LABELS[tool]}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p></div><Button asChild variant="outline"><Link href="/tools/history"><History className="size-4" />工具历史</Link></Button></div>{!aiConfigured && <p className="mb-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">AI 工具服务尚未配置。页面仍可使用，提交时不会产生通用 500。</p>}<ToolRunner aiConfigured={aiConfigured} tool={tool} /></AppShell>;
}
