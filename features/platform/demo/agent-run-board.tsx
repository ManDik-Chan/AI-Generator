"use client";

import { useState } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AgentWorkerView } from "@/features/agents/client-types";
import { AgentWorkerCard } from "@/features/agents/components/agent-worker-card";
import { PREVIEW_NOW } from "@/features/platform/demo/agent";

/** Renders sample workers with the real Worker card; actions never reach a server. */
export function AgentRunBoard({ workers }: { workers: AgentWorkerView[] }) {
  const [open, setOpen] = useState(false);
  const cancel = async () => {
    throw new Error("演示预览不会停止真实 Worker。登录后可在真实 Agent 运行中使用此操作。");
  };
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setOpen((value) => !value)} size="sm" type="button" variant="ghost">
          {open ? <ChevronsDownUp className="size-4" /> : <ChevronsUpDown className="size-4" />}{open ? "全部收起" : "全部展开"}
        </Button>
      </div>
      <div className="grid gap-2 min-[900px]:grid-cols-2">
        {workers.map((worker) => <AgentWorkerCard forceOpen={open} key={worker.key} now={PREVIEW_NOW} onCancel={cancel} worker={worker} />)}
      </div>
    </div>
  );
}
