import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, FolderPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ContinueBlock, HomeHero, HubIndex, PlatformPath, PrivacyBand, ProjectsStrip } from "@/features/home/components/workspace-home";
import { summarizeWorkspace } from "@/features/home/presentation";
import { demoActivity, demoMetrics } from "@/features/platform/demo/workspace";
import { listMyProjects } from "@/features/platform/source";

export const metadata: Metadata = { title: { absolute: "演示工作台 · AI-Generator" } };

export default function DemoHomePage() {
  return (
    <div className="pb-6">
      <HomeHero
        actions={
          <>
            <Button asChild size="lg"><Link href="/platform/chat" prefetch={false}>开始新对话<ArrowUpRight className="size-4" /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/platform/projects/new" prefetch={false}><FolderPlus className="size-4" />新建项目</Link></Button>
          </>
        }
        kicker="下午好，访客"
        mode="demo"
        summary={summarizeWorkspace(demoMetrics)}
      />
      <div className="rule-draw mb-12" />
      <div className="grid gap-x-12 gap-y-12 min-[1024px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <ContinueBlock activity={demoActivity} mode="demo" sample />
        <HubIndex metrics={demoMetrics} mode="demo" sample />
      </div>
      <ProjectsStrip mode="demo" projects={listMyProjects().data} />
      <PlatformPath mode="demo" />
      <PrivacyBand mode="demo" />
    </div>
  );
}
