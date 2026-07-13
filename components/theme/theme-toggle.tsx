"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";
import type { ThemePreference } from "@/lib/theme";

const options: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "light", label: "浅色", icon: Sun }, { value: "dark", label: "深色", icon: Moon }, { value: "system", label: "跟随系统", icon: Laptop },
];

export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { theme, setTheme } = useTheme();
  if (compact) { const current = options.findIndex((item) => item.value === theme); const next = options[(current + 1) % options.length]; return <Button aria-label={`切换主题，当前${options[current]?.label ?? "跟随系统"}`} className={className} onClick={() => setTheme(next.value)} size="icon-sm" title={`主题：${options[current]?.label ?? "跟随系统"}`} variant="ghost"><next.icon className="size-4" aria-hidden="true" /></Button>; }
  return <div aria-label="外观主题" className={cn("grid grid-cols-3 gap-1 rounded-control bg-surface-subtle p-1", className)} role="group">{options.map((option) => <button aria-pressed={theme === option.value} className={cn("flex min-h-9 items-center justify-center gap-1.5 rounded-[.55rem] px-2 text-caption transition-colors duration-fast", theme === option.value ? "bg-surface-raised text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")} key={option.value} onClick={() => setTheme(option.value)} type="button"><option.icon className="size-3.5" aria-hidden="true" /><span>{option.label}</span></button>)}</div>;
}
