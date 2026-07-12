"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function PersonaAvatar({ name, src, className }: { name: string; src?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const hue = (name.codePointAt(0) ?? 120) % 360;
  if (!src || failed) {
    return <span aria-label={`${name} 的头像`} className={cn("grid shrink-0 place-items-center rounded-2xl font-semibold text-white", className)} style={{ background: `linear-gradient(135deg,hsl(${hue} 70% 55%),hsl(${(hue + 55) % 360} 65% 38%))` }}>{name.trim().charAt(0) || "AI"}</span>;
  }
  return <Image alt={`${name} 的头像`} className={cn("shrink-0 rounded-2xl object-cover", className)} height={128} onError={() => setFailed(true)} src={src} width={128} />;
}
