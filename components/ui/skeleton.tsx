import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div aria-hidden="true" className={cn("animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none", className)} {...props} />; }
export function PageSkeleton() { return <div aria-label="页面正在加载" className="space-y-6" role="status"><div className="space-y-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-2/3 max-w-md" /><Skeleton className="h-4 w-full max-w-xl" /></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton className="h-44" key={index} />)}</div><span className="sr-only">正在加载</span></div>; }
