/** Pill links in the header of public pages outside the landing (Explore, Research, Demos, Docs). */
export const siteLinks = [
  { href: "/explore", label: "探索" },
  { href: "/research", label: "研究" },
  { href: "/demos", label: "Demo" },
  { href: "/docs", label: "开发者" },
  { href: "/platform", label: "演示工作台" },
  { href: "/platform/hub", label: "AI Hub" },
] as const;

/**
 * The one link that represents the current page: the longest href that equals the path or
 * is a parent of it, so /platform/hub marks "AI Hub" and not also "演示工作台".
 */
export function activeSiteLink(pathname: string, hrefs: readonly string[] = siteLinks.map((link) => link.href)) {
  return hrefs
    .filter((href) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}
