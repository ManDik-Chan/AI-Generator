import type { Metadata } from "next";

import { ResearchIndex } from "@/features/research/components/research-index";

export const metadata: Metadata = { title: { absolute: "Research Lab · AI-Generator" } };

export default function ResearchPage() {
  return <ResearchIndex />;
}
