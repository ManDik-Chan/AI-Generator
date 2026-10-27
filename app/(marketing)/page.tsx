import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import { LandingPage } from "@/features/landing/components/landing-page";
import { isLandingLang, LANG_COOKIE, landingCopy, type LandingLang } from "@/features/landing/content";

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
  const lang = await resolveLang(searchParams);
  const { title, description } = landingCopy[lang].meta;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: "https://www.ai-mdc.com" },
    openGraph: { title, description, locale: lang === "en" ? "en_US" : "zh_CN", type: "website", url: "https://www.ai-mdc.com" },
  };
}

export const viewport: Viewport = { themeColor: "#f2efea" };

export default async function MarketingPage({ searchParams }: Props) {
  return <LandingPage lang={await resolveLang(searchParams)} />;
}
