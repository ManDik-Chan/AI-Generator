import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
export function Avatar({ name, children, className, ...props }: HTMLAttributes<HTMLSpanElement> & { name: string; children?: ReactNode }) { return <span aria-label={name} className={cn("inline-grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-primary-subtle text-label text-primary-subtle-foreground", className)} {...props}>{children ?? name.trim().slice(0, 1).toUpperCase()}</span>; }
