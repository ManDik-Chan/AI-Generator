import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const surfaceVariants = cva("min-w-0 rounded-card border", { variants: { variant: {
  default: "border-border bg-surface-raised",
  interactive: "border-border bg-surface-raised transition-[border-color,box-shadow,transform] duration-fast hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-raised",
  emphasis: "border-primary/20 bg-primary-subtle/60",
  subtle: "border-transparent bg-surface-subtle",
  status: "border-border-strong/50 bg-surface",
  empty: "border-dashed border-border-strong/65 bg-surface/45",
} }, defaultVariants: { variant: "default" } });
export function Surface({ className, variant, ...props }: HTMLAttributes<HTMLDivElement> & VariantProps<typeof surfaceVariants>) { return <div className={cn(surfaceVariants({ variant }), className)} {...props} />; }
