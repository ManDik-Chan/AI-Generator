import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 active:translate-y-px",
  { variants: {
    variant: {
      default: "border border-transparent bg-primary text-primary-foreground shadow-soft hover:bg-primary-hover",
      secondary: "border border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/75",
      outline: "border border-border-strong/65 bg-surface-raised text-foreground hover:border-primary/45 hover:bg-surface-subtle",
      ghost: "border border-transparent text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
      destructive: "border border-transparent bg-destructive text-white hover:bg-destructive/90 dark:text-background",
    },
    size: { default: "h-11 px-5", sm: "h-9 px-3.5 text-[.8125rem]", lg: "h-12 px-6", icon: "size-11", "icon-sm": "size-9" },
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
