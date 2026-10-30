import type { Metadata } from "next";

import { DocPage } from "@/features/docs/components/docs-shell";
import { readDoc } from "@/features/docs/content";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "Manifest 与能力描述符" };

export default function DocsManifestPage() {
  return <DocPage active="/docs/manifest" kicker="开发者文档 · Manifest" markdown={readDoc("manifest.md")} source="docs/developer/manifest.md" />;
}
