"use client";
import { Button } from "@/components/ui/button";
export default function PersonasError({ reset }: { error: Error; reset(): void }) { return <div className="grid min-h-screen place-items-center p-6 text-center"><div><h2 className="text-xl font-semibold">人格暂时无法加载</h2><p className="mt-2 text-sm text-muted-foreground">请检查网络后重试。</p><Button className="mt-4" onClick={reset}>重试</Button></div></div>; }
