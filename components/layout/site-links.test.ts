/*
 * Every internal link written in the site's source must land on a route that exists,
 * and every `#anchor` must land on a heading or element id that exists.
 *
 * Links are read from the source text (href props, `href:` fields, footer tuples), so the
 * check covers pages, navigation config and content files without rendering anything.
 * Dynamic routes are checked against the same data the pages prerender from.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { readDoc, tableOfContents } from "@/features/docs/content";
import { previewAgentRuns } from "@/features/platform/demo/agent";
import { myProjectSlugs, publicProjectSlugs } from "@/features/platform/source";
import { experimentParams, researchProjectSlugs } from "@/features/research/source";
import { getShowcaseRelease } from "@/features/showcase/releases";

const root = process.cwd();
const appDir = join(root, "app");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** URL pattern for each page.tsx / route.ts, with route groups removed. */
function routePatterns() {
  return walk(appDir)
    .filter((file) => /[\\/](page\.tsx|route\.ts)$/.test(file))
    .map((file) => {
      const segments = relative(appDir, file).split(sep).slice(0, -1).filter((segment) => !/^\(.+\)$/.test(segment));
      const source = segments.map((segment) => {
        if (/^\[\[\.\.\..+\]\]$/.test(segment)) return "(?:/.*)?";
        if (/^\[\.\.\..+\]$/.test(segment)) return "/.+";
        if (/^\[.+\]$/.test(segment)) return "/[^/]+";
        return `/${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
      }).join("");
      return { route: `/${segments.join("/")}`, pattern: new RegExp(`^${source || "/"}$`) };
    });
}

const routes = routePatterns();

/** Concrete values for dynamic segments whose pages use `dynamicParams = false` or notFound(). */
const knownParams: { pattern: RegExp; valid: (match: RegExpMatchArray) => boolean }[] = [
  { pattern: /^\/explore\/([^/]+)$/, valid: ([, slug]) => publicProjectSlugs().includes(slug) },
  { pattern: /^\/explore\/([^/]+)\/release$/, valid: ([, slug]) => Boolean(getShowcaseRelease(slug)) },
  { pattern: /^\/research\/([^/]+)$/, valid: ([, slug]) => researchProjectSlugs().includes(slug) },
  { pattern: /^\/research\/([^/]+)\/([^/]+)$/, valid: ([, slug, experiment]) => experimentParams().some((params) => params.slug === slug && params.experiment === experiment) },
  { pattern: /^\/platform\/projects\/([^/]+)$/, valid: ([, slug]) => slug === "new" || myProjectSlugs().includes(slug) },
  { pattern: /^\/platform\/developer\/projects\/([^/]+)$/, valid: ([, slug]) => myProjectSlugs().includes(slug) },
  { pattern: /^\/platform\/agent\/([^/]+)$/, valid: ([, id]) => previewAgentRuns.some((run) => run.id === id) },
];

const docAnchors = new Map<string, Set<string>>(
  ([["/docs/guide", "guide.md"], ["/docs/api", "api-reference.md"], ["/docs/manifest", "manifest.md"], ["/docs/status", "interface-status.md"]] as const)
    .map(([route, file]) => [route, new Set(tableOfContents(readDoc(file)).map((entry) => entry.id))]),
);

const sourceFiles = ["app", "components", "features"]
  .flatMap((dir) => walk(join(root, dir)))
  .filter((file) => /\.(tsx?|mts)$/.test(file) && !/\.test\.tsx?$/.test(file));
const corpus = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");

interface FoundLink { href: string; file: string }

/** Internal links: quoted "/..." strings on lines that set an href, plus ["label", "/path"] tuples. */
function collectLinks(): FoundLink[] {
  const links: FoundLink[] = [];
  for (const file of sourceFiles) {
    const name = relative(root, file).split(sep).join("/");
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const hrefLine = /href/i.test(line);
      const strings = hrefLine
        ? [...line.matchAll(/["'`](\/[^"'`\s]*)["'`]/g)].map((match) => match[1])
        : [...line.matchAll(/\[\s*"[^"]*",\s*"(\/[^"\s]*)"\s*\]/g)].map((match) => match[1]);
      for (const href of strings) {
        if (href.includes("*") || href.includes("${") || href.startsWith("//")) continue;
        links.push({ href, file: name });
      }
    }
  }
  return links;
}

const links = collectLinks();

function resolves(path: string) {
  if (!routes.some((route) => route.pattern.test(path))) return false;
  for (const known of knownParams) {
    const match = path.match(known.pattern);
    if (match) return known.valid(match);
  }
  return true;
}

describe("internal links in the site source", () => {
  it("finds the links it is meant to check", () => {
    const hrefs = new Set(links.map((link) => link.href));
    for (const href of ["/demos/route-optimizer", "/docs/api#route-optimizer-solve", "/platform/connections", "/workspace"]) expect(hrefs.has(href), href).toBe(true);
  });

  it("only point at routes that exist", () => {
    const broken = links.filter((link) => !resolves(link.href.split(/[?#]/)[0] || "/"));
    expect(broken.map((link) => `${link.file}: ${link.href}`)).toEqual([]);
  });

  it("only point at anchors that exist", () => {
    const broken = links.filter((link) => {
      const [path, hash] = link.href.split("#");
      if (!hash) return false;
      const id = decodeURIComponent(hash);
      const docs = docAnchors.get(path.split("?")[0]);
      if (docs) return !docs.has(id);
      return !new RegExp(`id(=|: ?)["'{]${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'}]`).test(corpus);
    });
    expect(broken.map((link) => `${link.file}: ${link.href}`)).toEqual([]);
  });
});
