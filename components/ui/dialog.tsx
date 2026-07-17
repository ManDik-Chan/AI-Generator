"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

let documentScrollLocks = 0;
let lockedScrollY = 0;

function lockDocumentScroll() {
  documentScrollLocks += 1;
  if (documentScrollLocks > 1) return;
  lockedScrollY = window.scrollY;
  document.documentElement.dataset.dialogOpen = "true";
  Object.assign(document.body.style, {
    position: "fixed",
    top: `-${lockedScrollY}px`,
    width: "100%",
    overflow: "hidden",
  });
}

function unlockDocumentScroll() {
  documentScrollLocks = Math.max(0, documentScrollLocks - 1);
  if (documentScrollLocks > 0) return;
  delete document.documentElement.dataset.dialogOpen;
  Object.assign(document.body.style, { position: "", top: "", width: "", overflow: "" });
  window.scrollTo({ top: lockedScrollY, behavior: "auto" });
}

interface DialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, title, description, children, footer, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    lockDocumentScroll();
    return unlockDocumentScroll;
  }, [open]);

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={cn(
        "m-auto w-[min(32rem,calc(100%-2rem))] max-h-[calc(100dvh-2rem)] overflow-hidden rounded-overlay border border-border/14 bg-surface-raised p-0 text-foreground shadow-overlay backdrop:bg-overlay/55 backdrop:backdrop-blur-sm",
        className,
      )}
      data-dialog-panel
      onCancel={(event) => { event.preventDefault(); onOpenChange(false); }}
      onClose={() => onOpenChange(false)}
      ref={ref}
    >
      <div className="grid max-h-[inherit] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/10 p-4 sm:p-5">
          <div className="min-w-0">
            <h2 className="text-section-title overflow-wrap-anywhere" id={titleId}>{title}</h2>
            {description ? <p className="mt-1 text-supporting" id={descriptionId}>{description}</p> : null}
          </div>
          <Button aria-label="关闭" className="shrink-0" onClick={() => onOpenChange(false)} size="icon" variant="ghost"><X className="size-4" /></Button>
        </div>
        <div className="premium-scrollbar min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>
        {footer ? <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border/10 p-4" data-dialog-footer>{footer}</div> : null}
      </div>
    </dialog>
  );
}

export function ConfirmDialog(props: DialogProps & { confirmAction: React.ReactNode; cancelLabel?: string }) {
  const { confirmAction, cancelLabel = "取消", ...dialog } = props;
  return <Dialog {...dialog} footer={<><Button onClick={() => dialog.onOpenChange(false)} variant="ghost">{cancelLabel}</Button>{confirmAction}</>} />;
}
