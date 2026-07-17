import { ToolPage } from "@/features/tools/components/tool-page";
import { getAiConfigurationStatus } from "@/lib/ai/config";
import { requireUser } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export default async function RewritePage() { await requireUser(); return <ToolPage aiConfigured={getAiConfigurationStatus().configured} description="改善语法、语气与结构，同时保持原意、事实和不确定性。" tool="REWRITE" />; }
