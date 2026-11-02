export function ownedToolRunWhere(userId: string, runId: string) {
  return { id: runId, userId } as const;
}

export function canBypassToolDailyLimit(role: "OWNER" | "ADMIN" | "USER") {
  return role === "ADMIN" || role === "OWNER";
}
