import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 active:translate-y-px",
  { variants: {
    variant: {
      default: "border border-transparent bg-foreground text-background shadow-[0_8px_22px_hsl(var(--overlay)/.14)] hover:-translate-y-0.5 hover:bg-foreground/92 hover:shadow-raised dark:bg-foreground dark:text-background",
      secondary: "border border-transparent bg-surface-muted text-foreground hover:-translate-y-0.5 hover:bg-surface-subtle",
      outline: "border border-border-strong/20 bg-surface/55 text-foreground backdrop-blur-sm hover:-translate-y-0.5 hover:border-foreground/45 hover:bg-surface-raised",
      ghost: "border border-transparent text-muted-foreground hover:bg-surface-muted hover:text-foreground",
      destructive: "border border-transparent bg-destructive text-white hover:bg-destructive/90 dark:text-background",
    },
    size: { default: "h-11 px-5", sm: "h-9 px-3.5 text-[.8125rem]", lg: "h-12 px-5", icon: "size-11", "icon-sm": "size-10" },
  }, defaultVariants: { variant: "default", size: "default" } },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean; loading?: boolean }

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
  const styles = cn(buttonVariants({ variant, size, className }));

  if (asChild) {
    return (
      <Slot className={styles} ref={ref} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      aria-busy={loading || undefined}
      className={styles}
      disabled={disabled || loading}
      ref={ref}
      {...props}
    >
      {loading ? (
        <LoaderCircle
          aria-hidden="true"
          className="size-4 animate-spin motion-reduce:animate-none"
        />
      ) : null}
      {children}
    </button>
  );
});
Button.displayName = "Button";
export { Button, buttonVariants };
