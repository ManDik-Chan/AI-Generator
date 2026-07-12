"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function PersonaAvatar({ name, src, className }: { name: string; src?: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const hue = (name.codePointAt(0) ?? 120) % 360;
  if (!src || failedSrc === src) {
    return <span aria-label={`${name} 的头像`} className={cn("grid shrink-0 place-items-center rounded-2xl font-semibold text-white", className)} style={{ background: `linear-gradient(135deg,hsl(${hue} 70% 55%),hsl(${(hue + 55) % 360} 65% 38%))` }}>{name.trim().charAt(0) || "AI"}</span>;
  }
  // The URL is server-controlled today; using a native image keeps this shared renderer source-agnostic for future managed storage URLs.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={`${name} 的头像`} className={cn("shrink-0 rounded-2xl object-cover", className)} onError={() => setFailedSrc(src)} src={src} />;
}
