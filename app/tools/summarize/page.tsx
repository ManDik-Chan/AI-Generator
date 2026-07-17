import { ToolPage } from "@/features/tools/components/tool-page";
import { getAiConfigurationStatus } from "@/lib/ai/config";
import { requireUser } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export default async function SummarizePage() { await requireUser(); return <ToolPage aiConfigured={getAiConfigurationStatus().configured} description="忠实提炼长文本，可输出段落摘要、要点列表或学习笔记。" tool="SUMMARIZE" />; }
