import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Flat tonal tiles (no glass, no heavy shadow); interactive tiles darken slightly on hover.
export const surfaceVariants = cva("min-w-0 rounded-card border", { variants: { variant: {
  default: "border-transparent bg-surface",
  interactive: "border-transparent bg-surface transition-[background-color,transform] duration-500 ease-out-expo hover:bg-surface-muted",
  emphasis: "border-transparent bg-lime/45",
  subtle: "border-transparent bg-surface-subtle",
  status: "border-border-strong/12 bg-surface-raised",
  empty: "surface-grid border-dashed border-foreground/18 bg-surface-raised/50",
} }, defaultVariants: { variant: "default" } });
export function Surface({ className, variant, ...props }: HTMLAttributes<HTMLDivElement> & VariantProps<typeof surfaceVariants>) { return <div className={cn(surfaceVariants({ variant }), className)} {...props} />; }
