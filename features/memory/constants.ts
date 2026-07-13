export const MEMORY_CATEGORIES = ["profile", "preference", "goal", "constraint", "relationship", "project", "other"] as const;
export const MEMORY_CATEGORY_LABELS: Record<(typeof MEMORY_CATEGORIES)[number], string> = { profile: "个人信息", preference: "偏好", goal: "目标", constraint: "限制", relationship: "关系", project: "项目", other: "其他" };
export const MEMORY_LIMITS = { content: 500, maxItems: 8, maxChars: 2400 } as const;
export const MEMORY_GOVERNANCE_LIMITS = { topicKey: 80, keywords: 12, keyword: 40, defaultMaxTotal: 300 } as const;
export function getMemoryMaxTotal(env: Record<string, string | undefined> = process.env) { const value = Number(env.MEMORY_MAX_TOTAL); return Number.isInteger(value) && value >= 1 && value <= 10000 ? value : MEMORY_GOVERNANCE_LIMITS.defaultMaxTotal; }
export function getMemoryRuntimeLimits(env: Record<string, string | undefined> = process.env) { const items = Number(env.MEMORY_MAX_ITEMS); const chars = Number(env.MEMORY_MAX_CHARS); return { maxItems: Number.isInteger(items) && items > 0 && items <= 20 ? items : 8, maxChars: Number.isInteger(chars) && chars >= 200 && chars <= 10000 ? chars : 2400 }; }
