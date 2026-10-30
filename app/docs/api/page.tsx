import type { Metadata } from "next";

import { DocPage } from "@/features/docs/components/docs-shell";
import { readDoc } from "@/features/docs/content";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "API Reference" };

export default function DocsApiPage() {
  return <DocPage active="/docs/api" kicker="开发者文档 · API Reference" markdown={readDoc("api-reference.md")} source="docs/developer/api-reference.md" />;
}
