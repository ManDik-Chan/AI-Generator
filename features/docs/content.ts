/*
 * Developer docs are Markdown files in docs/developer — the same files readers see on
 * GitHub. Site pages read them at build time (statically prerendered), so the website
 * and the repository can never disagree.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const DOCS_DIR = "docs/developer";

export function readDoc(file: string) {
  return readFileSync(join(process.cwd(), DOCS_DIR, file), "utf8").replace(/\r\n/g, "\n");
}

/** Anchor id for a heading: lower-case letters and digits (any script) joined by hyphens. */
export function headingSlug(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Plain heading text (inline code and links reduced to their text). */
export function headingText(markdown: string) {
  return markdown.replace(/`([^`]*)`/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim();
}

export interface TocEntry {
  depth: 2 | 3;
  text: string;
  id: string;
}

/** h2/h3 headings outside fenced code blocks. */
export function tableOfContents(markdown: string): TocEntry[] {
  const entries: TocEntry[] = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^```/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const match = /^(##|###)\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const text = headingText(match[2]);
    entries.push({ depth: match[1].length as 2 | 3, text, id: headingSlug(text) });
  }
  return entries;
}

/** The first h1 and the paragraph after it, for page titles. */
export function docTitle(markdown: string) {
  const title = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? "";
  return headingText(title);
}

export type DocSegment = { kind: "markdown"; text: string } | { kind: "widget"; name: string };

/** Split on `<!-- widget: name -->` markers (invisible on GitHub) and drop other comments. */
export function splitWidgets(markdown: string): DocSegment[] {
  const segments: DocSegment[] = [];
  const pattern = /<!--\s*widget:\s*([a-z-]+)\s*-->/g;
  let last = 0;
  for (const match of markdown.matchAll(pattern)) {
    segments.push({ kind: "markdown", text: markdown.slice(last, match.index) });
    segments.push({ kind: "widget", name: match[1] });
    last = (match.index ?? 0) + match[0].length;
  }
  segments.push({ kind: "markdown", text: markdown.slice(last) });
  return segments
    .map((segment) => (segment.kind === "markdown" ? { ...segment, text: segment.text.replace(/<!--[\s\S]*?-->/g, "") } : segment))
    .filter((segment) => segment.kind === "widget" || segment.text.trim());
}

/** Body without the leading h1 (the page renders its own title block). */
export function withoutTitle(markdown: string) {
  return markdown.replace(/^#\s+.+\n+/, "");
}
