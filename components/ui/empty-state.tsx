import type { ReactNode } from "react";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) { return <Surface className={cn("grid place-items-center px-5 py-14 text-center", className)} variant="empty"><div className="max-w-sm">{icon ? <span className="mx-auto grid size-12 place-items-center rounded-full bg-lime text-[hsl(213_21%_10%)]">{icon}</span> : null}<h2 className="mt-4 text-card-title">{title}</h2>{description ? <div className="mt-2 text-supporting">{description}</div> : null}{action ? <div className="mt-5 flex justify-center">{action}</div> : null}</div></Surface>; }
