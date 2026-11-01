"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRound } from "lucide-react";

import { ConsoleModeSwitch } from "@/features/developer-console/components/console-mode-switch";
import { useConsole, useConsoleAdapter } from "@/features/developer-console/components/console-provider";
import { cn } from "@/lib/utils";

/**
 * Second navigation row of the developer console plus the two facts every console screen
 * must show: where the data comes from, and who the console is acting as. `registryHref` is
 * set only on the signed-in console, where the read-only Registry mode exists.
 */
export function ConsoleHeader({ base, registryHref }: { base: string; registryHref?: string }) {
  const pathname = usePathname() ?? "";
  const snapshot = useConsole();
  const adapter = useConsoleAdapter();
  const deskSlug = snapshot.summaries.find((summary) => summary.pendingReview)?.slug ?? snapshot.summaries[0]?.slug;
  const items = [
    { key: "workbench", label: "工作台", href: base, active: pathname === base },
    { key: "desk", label: "发布台", href: `${base}/projects/${deskSlug}`, active: pathname.startsWith(`${base}/projects/`) },
    { key: "integrate", label: "接入", href: `${base}/integrate`, active: pathname === `${base}/integrate` },
    { key: "access", label: "权限与隐私", href: `${base}/access`, active: pathname === `${base}/access` },
  ];
  const persona = snapshot.personas.find((item) => item.id === snapshot.personaId);

  return (
    <div className="mb-8 border-b border-border/12 min-[1024px]:mb-10" data-console-header="">
      <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
        <nav aria-label="开发者控制台" className="scroll-x -mx-1 flex gap-1 px-1">
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
          {registryHref ? <ConsoleModeSwitch active="mock" mockHref={base} registryHref={registryHref} /> : null}
          <span className="demo-outline inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[.75rem]" title="所有数据来自浏览器内的 Mock Adapter，刷新即重置，不调用任何服务">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
            <b className="font-medium">{snapshot.source === "mock" ? "Mock 数据源" : "Registry"}</b>
            <span className="text-muted-foreground max-[520px]:hidden">· 不保存</span>
          </span>
          {adapter.tools ? (
            <label className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface pl-3 pr-1 text-[.75rem]">
              <UserRound aria-hidden="true" className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">模拟身份</span>
              <select
                aria-describedby="console-persona-note"
                className="h-7 cursor-pointer rounded-full border-0 bg-surface-raised px-2 text-[.75rem] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                onChange={(event) => adapter.tools?.setPersona(event.target.value)}
                value={snapshot.personaId}
              >
                {snapshot.personas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <span className="sr-only" id="console-persona-note">{persona?.note}</span>
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}
