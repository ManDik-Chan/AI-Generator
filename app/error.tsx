"use client";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
export default function AppError({ reset }: { error: Error; reset(): void }) { return <main className="grid min-h-screen place-items-center px-5"><EmptyState action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={reset}><RotateCcw className="size-4" />重试</Button><Button asChild variant="outline"><Link href="/">返回首页</Link></Button></div>} className="w-full max-w-xl" description="请检查网络后重试。如果问题持续出现，可以先返回首页。" title="页面暂时无法加载" /></main>; }
