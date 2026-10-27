import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Pill buttons. Filled variants get a lime fill that rises from the bottom on hover (.btn-wipe).
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-[.8125rem] font-medium tracking-[.01em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 active:scale-[.97]",
  { variants: {
    variant: {
      default: "btn-wipe border border-foreground bg-foreground text-background",
      secondary: "btn-wipe border border-transparent bg-surface-muted text-foreground",
      outline: "btn-wipe border border-foreground/25 bg-transparent text-foreground",
      ghost: "border border-transparent text-muted-foreground transition-colors duration-300 hover:bg-surface hover:text-foreground",
      destructive: "border border-transparent bg-destructive text-white transition-colors duration-300 hover:bg-destructive/90 dark:text-background",
    },
    size: { default: "h-11 px-5", sm: "h-9 px-4 text-xs", lg: "h-12 px-6", icon: "size-11", "icon-sm": "size-10" },
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
