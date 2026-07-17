"use client";

export type DurableTerminalStatus = "PENDING" | "COMPLETE" | "ERROR" | "CANCELLED";

export async function requestDurableCancellation(url: string): Promise<DurableTerminalStatus> {
  const response = await fetch(url, { method: "POST", keepalive: true });
  const body = await response.json().catch(() => null) as { status?: unknown; message?: unknown } | null;
  if (!response.ok) throw new Error(typeof body?.message === "string" ? body.message : "停止请求未确认，任务可能仍在后台处理。");
  if (body?.status !== "PENDING" && body?.status !== "COMPLETE" && body?.status !== "ERROR" && body?.status !== "CANCELLED") {
    throw new Error("停止请求返回了无效状态，任务可能仍在后台处理。");
  }
  return body.status;
}
