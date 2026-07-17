"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function DeleteConversationDialog({ title, onConfirm, onClose }: { title: string; onConfirm(): Promise<void>; onClose(): void }) {
  const [deleting, setDeleting] = useState(false);

  return <Dialog
    description={`“${title}”及其中全部消息将永久删除，此操作无法撤销。`}
    footer={<><Button disabled={deleting} onClick={onClose} type="button" variant="ghost">取消</Button><Button
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={deleting}
            onClick={async () => { setDeleting(true); await onConfirm(); setDeleting(false); }}
            type="button"
          >
            {deleting ? "正在删除…" : "删除"}
          </Button></>}
    onOpenChange={(open) => { if (!open && !deleting) onClose(); }}
    open
    title="删除这段对话？"
  ><p className="break-words text-sm leading-6 text-muted-foreground">删除后无法恢复，请确认是否继续。</p></Dialog>;
}
