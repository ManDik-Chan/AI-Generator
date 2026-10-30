import type { Metadata } from "next";

import { DocPage } from "@/features/docs/components/docs-shell";
import { readDoc } from "@/features/docs/content";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "开发者手册" };

export default function DocsGuidePage() {
  return <DocPage active="/docs/guide" kicker="开发者文档 · Guide" markdown={readDoc("guide.md")} source="docs/developer/guide.md" />;
}
