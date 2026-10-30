import type { Metadata } from "next";

import { DocPage } from "@/features/docs/components/docs-shell";
import { readDoc } from "@/features/docs/content";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "接口清单" };

export default function DocsStatusPage() {
  return <DocPage active="/docs/status" kicker="开发者文档 · Status" markdown={readDoc("interface-status.md")} source="docs/developer/interface-status.md" />;
}
