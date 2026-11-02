import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import { LandingPage } from "@/features/landing/components/landing-page";
import { isLandingLang, LANG_COOKIE, type LandingLang } from "@/features/landing/content";
import { landingMetadata } from "@/features/landing/metadata";

type Props = { searchParams: Promise<{ lang?: string | string[] }> };

/** ?lang= wins, then the remembered choice, then Chinese. */
async function resolveLang(searchParams: Props["searchParams"]): Promise<LandingLang> {
  const query = (await searchParams).lang;
  const fromQuery = Array.isArray(query) ? query[0] : query;
  if (isLandingLang(fromQuery)) return fromQuery;
  const fromCookie = (await cookies()).get(LANG_COOKIE)?.value;
  return isLandingLang(fromCookie) ? fromCookie : "zh";
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return landingMetadata(await resolveLang(searchParams));
}

export const viewport: Viewport = { themeColor: "#f2efea" };

export default async function MarketingPage({ searchParams }: Props) {
  return <LandingPage lang={await resolveLang(searchParams)} />;
}
