import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export function Divider({ className, ...props }: HTMLAttributes<HTMLHRElement>) { return <hr className={cn("border-0 border-t border-border/12", className)} {...props} />; }
