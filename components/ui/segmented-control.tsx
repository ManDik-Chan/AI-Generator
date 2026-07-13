import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export function SegmentedControl({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) { return <div aria-label={label} className={cn("inline-flex rounded-control bg-surface-subtle p-1", className)} role="tablist">{children}</div>; }
export function Segment({ active, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) { return <button aria-selected={active} className={cn("min-h-9 rounded-[.55rem] px-3 text-label text-muted-foreground transition-colors duration-fast hover:text-foreground", active && "bg-surface-raised text-foreground shadow-soft", className)} role="tab" type="button" {...props} />; }
