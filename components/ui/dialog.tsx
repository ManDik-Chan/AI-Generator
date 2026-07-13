"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export function Dialog({ open, onOpenChange, title, description, children, footer, className }: { open: boolean; onOpenChange(open: boolean): void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) dialog.close(); }, [open]);
  return <dialog aria-describedby={description ? "dialog-description" : undefined} aria-labelledby="dialog-title" className={cn("m-auto w-[min(32rem,calc(100%-2rem))] rounded-overlay border bg-surface-raised p-0 text-foreground shadow-overlay backdrop:bg-overlay/55 backdrop:backdrop-blur-sm", className)} onCancel={(event) => { event.preventDefault(); onOpenChange(false); }} onClose={() => onOpenChange(false)} ref={ref}><div className="flex items-start justify-between gap-4 border-b p-5"><div><h2 className="text-section-title" id="dialog-title">{title}</h2>{description ? <p className="mt-1 text-supporting" id="dialog-description">{description}</p> : null}</div><Button aria-label="关闭" onClick={() => onOpenChange(false)} size="icon-sm" variant="ghost"><X className="size-4" /></Button></div><div className="p-5">{children}</div>{footer ? <div className="flex flex-wrap justify-end gap-2 border-t p-4">{footer}</div> : null}</dialog>;
}
export function ConfirmDialog(props: Parameters<typeof Dialog>[0] & { confirmAction: React.ReactNode; cancelLabel?: string }) { const { confirmAction, cancelLabel = "取消", ...dialog } = props; return <Dialog {...dialog} footer={<><Button onClick={() => dialog.onOpenChange(false)} variant="ghost">{cancelLabel}</Button>{confirmAction}</>} />; }
