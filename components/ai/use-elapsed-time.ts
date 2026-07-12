"use client";

import { useEffect, useState } from "react";

export function useElapsedTime(active: boolean) {
  const [startedAt, setStartedAt] = useState<number>(); const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => { if (!active) { setStartedAt(undefined); setElapsedSeconds(0); return; } const start = Date.now(); setStartedAt(start); setElapsedSeconds(0); const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - start) / 1000)), 1000); return () => window.clearInterval(timer); }, [active]);
  return startedAt === undefined ? 0 : elapsedSeconds;
}

export function formatElapsedTime(seconds: number) {
  if (seconds < 60) return `已用时 ${seconds} 秒`;
  return `已用时 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
