import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="mt-3 text-3xl font-semibold">这里还没有内容</h1>
        <p className="mt-3 text-muted-foreground">返回首页，继续创建你的 AI 空间。</p>
        <Button asChild className="mt-6">
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    </main>
  );
}
