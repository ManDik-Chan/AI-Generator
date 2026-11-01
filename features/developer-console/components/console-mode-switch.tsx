import Link from "next/link";

import { cn } from "@/lib/utils";

export type ConsoleMode = "mock" | "registry";

/**
 * Switches between the two data sources of the signed-in console. They are separate routes with
 * separate providers, so neither mode can show the other's data.
 */
export function ConsoleModeSwitch({ active, mockHref, registryHref }: { active: ConsoleMode; mockHref: string; registryHref: string }) {
  const items: { mode: ConsoleMode; label: string; href: string; title: string }[] = [
    { mode: "mock", label: "Mock 演示", href: mockHref, title: "浏览器内的示例数据，可以切换身份并完整演示写入流程，不保存" },
    { mode: "registry", label: "Registry 只读", href: registryHref, title: "以当前登录身份读取 Registry 的真实数据，不发送任何写请求" },
  ];
  return (
    <nav aria-label="数据来源" className="inline-flex h-8 items-center gap-0.5 rounded-full bg-surface p-0.5 text-[.75rem]">
      {items.map((item) => (
        <Link
          aria-current={item.mode === active ? "page" : undefined}
          className={cn(
            "inline-flex h-7 items-center whitespace-nowrap rounded-full px-3 font-medium transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
            item.mode === active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
          href={item.href}
          key={item.mode}
          prefetch={false}
          title={item.title}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
