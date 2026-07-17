import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
export default function NotFound() { return <main className="flex min-h-[var(--app-height)] flex-col px-5 py-6 sm:px-8"><Brand /><div className="grid flex-1 place-items-center py-16 text-center"><div className="max-w-md"><span className="mx-auto grid size-14 place-items-center rounded-card bg-primary-subtle text-primary"><Compass className="size-6" /></span><p className="mt-6 text-label text-primary">404</p><h1 className="mt-2 text-page-title">这个页面不在这里</h1><p className="mt-3 text-supporting">链接可能已失效，或内容已经移动。返回首页继续使用你的工作空间。</p><Button asChild className="mt-6"><Link href="/"><ArrowLeft className="size-4" />返回首页</Link></Button></div></div></main>; }
