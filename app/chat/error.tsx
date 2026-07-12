"use client";

import { Button } from "@/components/ui/button";

export default function ChatError({ reset }: { error: Error; reset(): void }) {
  return (
    <div className="grid h-[100dvh] place-items-center px-4 text-center">
      <div><h2 className="text-xl font-semibold">对话暂时无法加载</h2><p className="mt-2 text-sm text-muted-foreground">请检查网络后重试。</p><Button className="mt-5" onClick={reset}>重试</Button></div>
    </div>
  );
}
