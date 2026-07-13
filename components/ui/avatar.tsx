"use client";

import { useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Avatar({
  name,
  src,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  name: string;
  src?: string;
  children?: ReactNode;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();

  return (
    <span
      aria-label={`${name} 的头像`}
      className={cn(
        "inline-grid size-10 shrink-0 place-items-center overflow-hidden rounded-control border border-border/12 bg-foreground text-label text-background shadow-soft",
        className,
      )}
      {...props}
    >
      {src && failedSrc !== src ? (
        // Profile avatar URLs are server-controlled; native loading keeps the renderer storage-agnostic.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="size-full object-cover"
          onError={() => setFailedSrc(src)}
          src={src}
        />
      ) : children ?? name.trim().slice(0, 1).toUpperCase() ?? "AI"}
    </span>
  );
}
