import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Small pill tags in the landing page's tag style.
export const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[.6875rem] font-medium leading-5", { variants: { variant: {
  default: "border-transparent bg-lime text-[hsl(213_21%_10%)]",
  neutral: "border-border/10 bg-surface-raised text-muted-foreground",
  success: "border-transparent bg-success-subtle text-success-foreground",
  warning: "border-transparent bg-warning-subtle text-warning-foreground",
  destructive: "border-transparent bg-destructive-subtle text-destructive-foreground",
  info: "border-transparent bg-info-subtle text-info-foreground",
} }, defaultVariants: { variant: "default" } });
export function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) { return <span className={cn(badgeVariants({ variant }), className)} {...props} />; }
