import { ToolPage } from "@/features/tools/components/tool-page";
import { getAiConfigurationStatus } from "@/lib/ai/config";
import { requireUser } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export default async function TranslatePage() { await requireUser(); return <ToolPage aiConfigured={getAiConfigurationStatus().configured} description="在七种语言之间翻译，并保护 Markdown、URL、数字和代码块。" tool="TRANSLATE" />; }
