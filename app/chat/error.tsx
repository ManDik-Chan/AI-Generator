"use client";

import Link from "next/link";
import { MessageSquareWarning, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function ChatError({ reset }: { error: Error; reset(): void }) {
  return <main className="surface-grid grid h-[100dvh] place-items-center bg-background px-4"><EmptyState action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={reset}><RotateCcw className="size-4" />重试</Button><Button asChild variant="outline"><Link href="/">返回首页</Link></Button></div>} className="w-full max-w-xl" description="请检查网络后重试，已有对话不会因此被删除。" icon={<MessageSquareWarning className="size-6" />} title="对话暂时无法加载" /></main>;
}
