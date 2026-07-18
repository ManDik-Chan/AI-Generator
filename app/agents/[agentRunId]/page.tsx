import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { AgentRunDetail } from "@/features/agents/components/agent-run-detail";
import { getOwnedAgentRunSnapshot } from "@/features/agents/queries";
import { getAgentDailyCreditLimit } from "@/lib/ai/config";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }: { params: Promise<{ agentRunId: string }> }) {
  const user = await requireUser();
  const { agentRunId } = await params;
  if (!z.string().uuid().safeParse(agentRunId).success) notFound();
  const run = await getOwnedAgentRunSnapshot(user.id, agentRunId, getAgentDailyCreditLimit());
  if (!run) notFound();
  return <AppShell variant="wide"><AgentRunDetail initialRun={run} /></AppShell>;
}
