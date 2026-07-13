export function ownedToolRunWhere(userId: string, runId: string) {
  return { id: runId, userId } as const;
}

export function canBypassToolDailyLimit(role: "ADMIN" | "USER") {
  return role === "ADMIN";
}
