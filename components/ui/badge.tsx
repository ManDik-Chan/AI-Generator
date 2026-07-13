import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-caption font-semibold", { variants: { variant: {
  default: "border-primary/20 bg-primary-subtle text-primary-subtle-foreground",
  neutral: "border-border bg-surface-subtle text-muted-foreground",
  success: "border-success/25 bg-success-subtle text-success-foreground",
  warning: "border-warning/25 bg-warning-subtle text-warning-foreground",
  destructive: "border-destructive/25 bg-destructive-subtle text-destructive-foreground",
  info: "border-info/25 bg-info-subtle text-info-foreground",
} }, defaultVariants: { variant: "default" } });
export function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) { return <span className={cn(badgeVariants({ variant }), className)} {...props} />; }
