import * as React from "react";
import { cn } from "@/lib/utils";

const control = "w-full rounded-control border border-border-strong/55 bg-surface-raised text-sm text-foreground shadow-[0_1px_0_hsl(var(--overlay)/.03)] outline-none transition-[border-color,box-shadow,background-color] duration-fast placeholder:text-muted-foreground/75 hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-focus-ring/20 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-65 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/15";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => <input className={cn(control, "h-11 px-3.5", className)} ref={ref} {...props} />);
Input.displayName = "Input";
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => <textarea className={cn(control, "min-h-28 resize-y px-3.5 py-3 leading-6", className)} ref={ref} {...props} />);
Textarea.displayName = "Textarea";
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => <select className={cn(control, "h-11 px-3.5", className)} ref={ref} {...props} />);
Select.displayName = "Select";

export function Field({ label, htmlFor, help, error, count, required, children, className }: { label: string; htmlFor: string; help?: string; error?: string; count?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  const descriptionId = `${htmlFor}-description`;
  return <div className={cn("grid gap-1.5", className)}><label className="text-label" htmlFor={htmlFor}>{label}{required ? <span aria-hidden="true" className="ml-1 text-destructive">*</span> : null}</label>{children}{error || help || count ? <div className="flex items-start justify-between gap-3 text-caption" id={descriptionId}>{error ? <span className="text-destructive-foreground" role="alert">{error}</span> : <span>{help}</span>}{count ? <span className="ml-auto tabular-nums">{count}</span> : null}</div> : null}</div>;
}
