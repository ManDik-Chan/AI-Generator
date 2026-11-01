"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRound } from "lucide-react";

import { ConsoleModeSwitch } from "@/features/developer-console/components/console-mode-switch";
import { cn } from "@/lib/utils";

/**
 * Header of the read-only Registry mode. Same row as the mock console header, with the data source
 * stated as the real Registry and the acting identity fixed to the signed-in account.
 */
export function RegistryConsoleHeader({ base, mockHref }: { base: string; mockHref: string }) {
  const pathname = usePathname() ?? "";
  const items = [
    { key: "overview", label: "项目与资格", href: base, active: pathname === base },
  ];
  return (
    <div className="mb-8 border-b border-border/12 min-[1024px]:mb-10" data-console-header="" data-console-source="registry">
      <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
        <nav aria-label="开发者控制台 · Registry 只读" className="scroll-x -mx-1 flex gap-1 px-1">
          {items.map((item) => (
            <Link
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "relative flex h-11 shrink-0 items-center px-3 text-[.8125rem] font-medium transition-colors duration-300",
                "after:absolute after:inset-x-3 after:-bottom-px after:h-[2px] after:origin-left after:bg-foreground after:transition-transform after:duration-500 after:ease-out-expo",
                item.active ? "text-foreground after:scale-x-100" : "text-muted-foreground after:scale-x-0 hover:text-foreground",
              )}
              href={item.href}
              key={item.key}
              prefetch={false}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2 pb-2.5 min-[900px]:justify-end">
          <ConsoleModeSwitch active="registry" mockHref={mockHref} registryHref={base} />
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-success-subtle px-3 text-[.75rem] text-success-foreground" title="数据来自 Registry 内部只读接口，使用当前登录会话读取；不发送任何写请求，也不会改用 Mock 数据">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
            <b className="font-medium">Registry 数据源</b>
            <span className="opacity-80 max-[520px]:hidden">· 只读</span>
          </span>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-[.75rem]">
            <UserRound aria-hidden="true" className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">身份</span>
            <span className="font-medium">当前登录账户</span>
          </span>
        </div>
      </div>
    </div>
  );
}
