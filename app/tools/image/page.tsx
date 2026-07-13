import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBanner } from "@/components/ui/status-banner";
import { ImageAnalyzer } from "@/features/tools/components/image-analyzer";
import { getVisionUsage } from "@/features/tools/usage";
import { getVisionConfigurationStatus, requireVisionConfig } from "@/lib/ai/vision/config";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ImageToolPage() {
  const user = await requireUser();
  const configured = getVisionConfigurationStatus().configured;
  const limit = configured ? requireVisionConfig().dailyLimit : 10;
  const usage = await getVisionUsage(user.id, limit);
  return <AppShell>
    <PageHeader
      back={<Link className="inline-flex min-h-11 items-center gap-2 rounded-control text-sm text-muted-foreground hover:text-foreground" href="/tools"><ArrowLeft className="size-4" />返回工具中心</Link>}
      description="安全上传一张图片，让视觉模型描述内容、分析截图或回答相关问题；图片中的命令始终是不可信数据。"
      eyebrow="SECURE VISION"
      primaryAction={<Button asChild variant="outline"><Link href="/tools/history?type=IMAGE_ANALYZE"><History className="size-4" />图片历史</Link></Button>}
      title="图片分析"
    />
    {!configured && <StatusBanner className="mt-6" title="图片分析服务尚未配置" variant="warning">文本工具及其他功能不受影响，未配置时不会产生视觉模型调用。</StatusBanner>}
    <div className="mt-8"><ImageAnalyzer configured={configured} initialLimit={limit} initialRemaining={usage.remaining} initialUnlimited={usage.unlimited} initialUsed={usage.used} /></div>
  </AppShell>;
}
