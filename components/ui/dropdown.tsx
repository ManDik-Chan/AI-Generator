import type { DetailsHTMLAttributes, ReactNode } from "react";
import {
  DEFAULT_DROPDOWN_PLACEMENT,
  dropdownPlacementClasses,
  type DropdownPlacement,
} from "@/components/ui/dropdown-placement";
import { cn } from "@/lib/utils";

interface DropdownProps extends DetailsHTMLAttributes<HTMLDetailsElement> {
  trigger: ReactNode;
  placement?: DropdownPlacement;
}

export function Dropdown({
  trigger,
  children,
  className,
  placement = DEFAULT_DROPDOWN_PLACEMENT,
  ...props
}: DropdownProps) {
  return (
    <details className={cn("group relative", className)} {...props}>
      <summary className="list-none cursor-pointer rounded-control [&::-webkit-details-marker]:hidden">
        {trigger}
      </summary>
      <div
        className={cn(
          "absolute z-50 min-w-48 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto overscroll-contain break-words rounded-overlay border border-border/14 bg-surface-raised p-1.5 opacity-0 shadow-overlay transition-[opacity,transform] duration-fast group-open:opacity-100 motion-reduce:transform-none motion-reduce:transition-none",
          dropdownPlacementClasses[placement],
        )}
      >
        {children}
      </div>
    </details>
  );
}

export const Popover = Dropdown;

export function DropdownItem({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "flex min-h-10 w-full items-center gap-2 rounded-control px-3 text-left text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground",
        className,
      )}
      type="button"
      {...props}
    />
  );
}
