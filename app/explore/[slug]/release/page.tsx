import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReleaseShowcase } from "@/features/showcase/components/release-showcase";
import { getShowcaseRelease, showcaseReleaseSlugs } from "@/features/showcase/releases";

type Props = { params: Promise<{ slug: string }> };

// Only the two demo previews exist; every other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return showcaseReleaseSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entry = getShowcaseRelease((await params).slug);
  if (!entry) return { title: "版本页" };
  return {
    title: `${entry.release.name} · 版本页预览`,
    description: entry.release.summary,
    // A fixture preview is not a published release; keep it out of search results.
    robots: { index: false, follow: false },
  };
}

export default async function ReleasePreviewPage({ params }: Props) {
  const entry = getShowcaseRelease((await params).slug);
  if (!entry) notFound();
  return <ReleaseShowcase entry={entry} />;
}
