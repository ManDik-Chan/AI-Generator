import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const surfaceVariants = cva("min-w-0 rounded-card border", { variants: { variant: {
  default: "border-border/12 bg-surface/76 backdrop-blur-sm",
  interactive: "border-border/12 bg-surface/76 backdrop-blur-sm transition-[border-color,box-shadow,transform,background-color] duration-panel hover:-translate-y-1 hover:border-primary/35 hover:bg-surface-raised hover:shadow-raised",
  emphasis: "border-primary/18 bg-gradient-to-br from-primary-subtle to-surface-raised",
  subtle: "border-transparent bg-surface-muted/76",
  status: "border-border-strong/18 bg-surface/72 backdrop-blur-sm",
  empty: "surface-grid border-border-strong/12 bg-surface/55",
} }, defaultVariants: { variant: "default" } });
export function Surface({ className, variant, ...props }: HTMLAttributes<HTMLDivElement> & VariantProps<typeof surfaceVariants>) { return <div className={cn(surfaceVariants({ variant }), className)} {...props} />; }
