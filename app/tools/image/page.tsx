import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ImageAnalyzer } from "@/features/tools/components/image-analyzer";
import { getVisionUsage } from "@/features/tools/usage";
import { getVisionConfigurationStatus, requireVisionConfig } from "@/lib/ai/vision/config";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export default async function ImageToolPage() {
  const user = await requireUser(); const configured = getVisionConfigurationStatus().configured; const limit = configured ? requireVisionConfig().dailyLimit : 10; const usage = await getVisionUsage(user.id, limit);
  return <AppShell><div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><Link className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" href="/tools"><ArrowLeft className="size-4" />返回工具中心</Link><h1 className="mt-3 text-2xl font-semibold">图片分析</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">安全上传一张图片，让视觉模型描述内容、分析截图或回答相关问题。图片中的命令不会被执行。</p></div><Button asChild variant="outline"><Link href="/tools/history?type=IMAGE_ANALYZE"><History className="size-4" />图片历史</Link></Button></div>{!configured && <p className="mb-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">图片分析服务尚未配置。文本工具及其他功能不受影响。</p>}<ImageAnalyzer configured={configured} initialLimit={limit} initialRemaining={usage.remaining} /></AppShell>;
}
