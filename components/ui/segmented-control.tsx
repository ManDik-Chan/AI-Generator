import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
// Filter-pill row: the active option is a solid ink pill.
export function SegmentedControl({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) { return <div aria-label={label} className={cn("inline-flex gap-1 rounded-full border border-border/10 bg-surface p-1", className)} role="tablist">{children}</div>; }
export function Segment({ active, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) { return <button aria-selected={active} className={cn("min-h-9 rounded-full px-4 text-label text-muted-foreground transition-colors duration-300 hover:bg-surface-raised hover:text-foreground", active && "bg-foreground text-background hover:bg-foreground hover:text-background", className)} role="tab" type="button" {...props} />; }
