import type { BrainstormUsageDto } from "@/features/tools/brainstorm/types";

export function formatBrainstormUsage(usage: BrainstormUsageDto) {
  return usage.unlimited
    ? `管理员不限次数 · 今日已使用 ${usage.used} 次`
    : `今日剩余 ${usage.remaining} / ${usage.limit}`;
}
