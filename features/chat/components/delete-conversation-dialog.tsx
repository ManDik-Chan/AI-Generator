"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function DeleteConversationDialog({ title, onConfirm, onClose }: { title: string; onConfirm(): Promise<void>; onClose(): void }) {
  const [deleting, setDeleting] = useState(false);

  return (
    <div aria-modal="true" className="fixed inset-0 z-[70] grid place-items-center bg-overlay/55 p-4 backdrop-blur-sm" role="dialog">
      <div className="premium-panel-strong w-full max-w-sm p-5 sm:p-6">
        <h2 className="text-lg font-semibold">删除这段对话？</h2>
        <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">“{title}”及其中全部消息将永久删除，此操作无法撤销。</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button disabled={deleting} onClick={onClose} type="button" variant="ghost">取消</Button>
          <Button
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={deleting}
            onClick={async () => { setDeleting(true); await onConfirm(); setDeleting(false); }}
            type="button"
          >
            {deleting ? "正在删除…" : "删除"}
          </Button>
        </div>
      </div>
    </div>
  );
}
