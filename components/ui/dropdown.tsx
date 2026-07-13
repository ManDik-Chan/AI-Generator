import type { DetailsHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
export function Dropdown({ trigger, children, className, ...props }: DetailsHTMLAttributes<HTMLDetailsElement> & { trigger: ReactNode }) { return <details className={cn("group relative", className)} {...props}><summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">{trigger}</summary><div className="absolute right-0 z-40 mt-2 min-w-48 rounded-overlay border bg-surface-raised p-1.5 shadow-overlay">{children}</div></details>; }
export const Popover = Dropdown;
export function DropdownItem({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={cn("flex min-h-10 w-full items-center gap-2 rounded-control px-3 text-left text-sm text-muted-foreground hover:bg-surface-subtle hover:text-foreground", className)} type="button" {...props} />; }
