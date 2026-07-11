import Link from "next/link";
import { Bot, Home, MessageSquareText, Settings, Shapes, Wrench } from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";

const navigation = [
  { label: "首页", href: "/", icon: Home, active: true },
  { label: "聊天", href: "/chat", icon: MessageSquareText },
  { label: "人格", href: "/personas", icon: Shapes },
  { label: "工具", href: "/tools", icon: Wrench },
  { label: "设置", href: "/settings", icon: Settings },
];

export function DesktopSidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen border-r bg-card/70 px-4 py-6 backdrop-blur-xl md:flex md:flex-col">
      <div className="px-2">
        <Brand />
      </div>
      <Button className="mt-8 w-full justify-start" asChild>
        <Link href="/chat">
          <Bot className="size-4" aria-hidden="true" />
          新建对话
        </Link>
      </Button>
      <nav className="mt-5 space-y-1" aria-label="主导航">
        {navigation.map((item) => (
          <Link
            className={
              item.active
                ? "flex h-11 items-center gap-3 rounded-xl bg-muted px-3 text-sm font-medium"
                : "flex h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            }
            href={item.href}
            key={item.href}
          >
            <item.icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto rounded-2xl border bg-background/70 p-4">
        <p className="text-sm font-medium">Phase 1</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">基础体验已就绪，数据与登录将在下一阶段接入。</p>
      </div>
    </aside>
  );
}
