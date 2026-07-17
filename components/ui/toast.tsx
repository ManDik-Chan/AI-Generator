import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
export function Toast({ children, variant = "default", className }: { children: ReactNode; variant?: "default" | "success" | "error"; className?: string }) { return <div aria-live="polite" className={cn("safe-inline max-w-[calc(100vw-1rem)] overflow-wrap-anywhere rounded-card border border-border/14 bg-surface-raised px-4 py-3 text-sm shadow-overlay", variant === "success" && "border-success/30", variant === "error" && "border-destructive/30", className)} role="status">{children}</div>; }
