import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight, FolderPlus, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ContinueBlock, HomeHero, HubIndex, PlatformPath, PrivacyBand, ProjectsStrip } from "@/features/home/components/workspace-home";
import { getHomePersonalization } from "@/features/home/data";
import { getTimeGreeting, summarizeWorkspace } from "@/features/home/presentation";
import { listMyProjects } from "@/features/platform/source";

/*
 * Signed-in workspace home. Account data streams in through Suspense; the project strip
 * comes from the platform's reserved data interface, which is in demo state until the
 * Registry is deployed (the strip says so).
 */

function greetingNow() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Shanghai" }).format(new Date()));
  return getTimeGreeting(hour);
}

function HeroActions() {
  return (
    <>
      <Button asChild size="lg"><Link href="/chat" prefetch={false}>开始新对话<ArrowUpRight className="size-4" /></Link></Button>
      <Button asChild size="lg" variant="outline"><Link href="/projects/new" prefetch={false}><FolderPlus className="size-4" />新建项目</Link></Button>
    </>
  );
}

async function LiveHero() {
  const { displayName, metrics } = await getHomePersonalization();
  const greeting = greetingNow();
  return <HomeHero actions={<HeroActions />} kicker={displayName ? `${greeting}，${displayName}` : greeting} mode="live" summary={summarizeWorkspace(metrics)} />;
}

function OverviewFallback() {
  return (
    <div className="grid gap-x-12 gap-y-10 min-[1024px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="h-72 animate-pulse rounded-card bg-surface motion-reduce:animate-none" />
      <div className="h-72 animate-pulse rounded-card bg-surface motion-reduce:animate-none" />
    </div>
  );
}

async function LiveOverview() {
  const { activity, metrics, isAdmin } = await getHomePersonalization();
  return (
    <>
      <div className="grid gap-x-12 gap-y-12 min-[1024px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <ContinueBlock activity={activity} mode="live" />
        <HubIndex metrics={metrics} mode="live" />
      </div>
      {isAdmin ? (
        <div className="mt-8 flex flex-col gap-3 rounded-card bg-surface p-4 sm:flex-row sm:items-center">
          <span className="grid size-10 place-items-center rounded-full bg-surface-raised"><ShieldCheck className="size-4" /></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">管理员工作空间</p><p className="mt-1 text-caption">用户、用量、角色和系统状态入口仅对管理员可见。</p></div>
          <Button asChild size="sm" variant="outline"><Link href="/admin" prefetch={false}>系统管理</Link></Button>
        </div>
      ) : null}
    </>
  );
}

export function HomeDashboard() {
  return (
    <div className="pb-6">
      <Suspense fallback={<HomeHero actions={<HeroActions />} kicker="欢迎回来" mode="live" summary="正在读取你的工作台…" />}><LiveHero /></Suspense>
      <div className="rule-draw mb-12" />
      <Suspense fallback={<OverviewFallback />}><LiveOverview /></Suspense>
      <ProjectsStrip mode="live" projects={listMyProjects().data} />
      <PlatformPath mode="live" />
      <PrivacyBand mode="live" />
    </div>
  );
}
