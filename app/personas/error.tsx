"use client";

import Link from "next/link";
import { RotateCcw, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function PersonasError({ reset }: { error: Error; reset(): void }) {
  return <main className="surface-grid grid min-h-[var(--app-height)] place-items-center bg-background p-5"><EmptyState action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={reset}><RotateCcw className="size-4" />重试</Button><Button asChild variant="outline"><Link href="/">返回首页</Link></Button></div>} className="w-full max-w-xl" description="请检查网络后重试，已保存的人格不会因此改变。" icon={<UserRoundCog className="size-6" />} title="人格工作室暂时无法加载" /></main>;
}
