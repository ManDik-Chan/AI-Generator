"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function DeleteConversationDialog({ title, onConfirm, onClose }: { title: string; onConfirm(): Promise<void>; onClose(): void }) {
  const [deleting, setDeleting] = useState(false);

  return (
    <div aria-modal="true" className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4" role="dialog">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="text-lg font-semibold">删除这段对话？</h2>
        <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">“{title}”及其中全部消息将永久删除，此操作无法撤销。</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button disabled={deleting} onClick={onClose} type="button" variant="ghost">取消</Button>
          <Button
            className="bg-red-600 text-white hover:bg-red-700"
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
