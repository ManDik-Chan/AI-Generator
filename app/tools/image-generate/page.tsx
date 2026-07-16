import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBanner } from "@/components/ui/status-banner";
import { ImageGenerationWorkspace } from "@/features/tools/components/image-generation-workspace";
import { getImageGenerationDisplayConfig } from "@/features/tools/image-generation/config";
import { getImageGenerationHistory } from "@/features/tools/image-generation/queries";
import { getImageGenerationUsage } from "@/features/tools/usage";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ImageGeneratePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const search = await searchParams;
  const page = Math.max(1, Number.parseInt(search.page || "1", 10) || 1);
  const config = getImageGenerationDisplayConfig();
  const [usage, history] = await Promise.all([
    getImageGenerationUsage(user.id, config.dailyLimit),
    getImageGenerationHistory(user.id, page),
  ]);

  return <AppShell>
    <PageHeader
      back={<Link className="inline-flex min-h-11 items-center gap-2 rounded-control text-sm text-muted-foreground hover:text-foreground" href="/tools"><ArrowLeft className="size-4" />返回工具中心</Link>}
      description="输入画面描述并选择服务端白名单风格，每次明确点击只生成一张图片，结果仅保存在当前用户的私有空间。"
      eyebrow="PRIVATE IMAGE STUDIO"
      primaryAction={<Button asChild variant="outline"><Link href="/tools/history?type=IMAGE_GENERATE"><History className="size-4" />工具历史</Link></Button>}
      title="AI 图片创作"
    />
    {!config.configured && <StatusBanner className="mt-6" title="图片生成服务尚未配置" variant="warning">聊天、文本工具和图片分析不受影响；完成服务端配置前不会产生图片模型调用。</StatusBanner>}
    <div className="mt-8"><ImageGenerationWorkspace configured={config.configured} imageSize={config.size} initialHistory={history.images} initialPage={history.page} initialPages={history.pages} initialUsage={usage} /></div>
  </AppShell>;
}
