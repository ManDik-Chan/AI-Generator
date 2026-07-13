export interface VisionUsageDisplay {
  limit: number;
  used: number;
  remaining: number;
  unlimited: boolean;
}

export function formatVisionUsage({ limit, used, remaining, unlimited }: VisionUsageDisplay) {
  return unlimited ? `管理员不限次数 · 今日已使用 ${used} 次` : `今日剩余 ${remaining} / ${limit}`;
}
