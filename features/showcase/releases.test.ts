import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { demos } from "@/features/demos/catalog";
import { ProjectShowcase } from "@/features/platform/components/showcase";
import { getPublicProject, publicProjectSlugs } from "@/features/platform/source";
import { releaseDTOSchema } from "@/features/registry/contracts";
import { ReleaseShowcase } from "@/features/showcase/components/release-showcase";
import { getShowcaseRelease, showcaseReleases, showcaseReleaseSlugs } from "@/features/showcase/releases";

const visibleText = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");

describe("showcase release fixtures", () => {
  it.each(showcaseReleases.map((entry) => [entry.slug, entry] as const))("%s parses as a strict ReleaseDTO", (_slug, entry) => {
    expect(releaseDTOSchema.parse(entry.release)).toEqual(entry.release);
  });

  it("covers exactly the two real demos, each with a public project page", () => {
    expect(showcaseReleaseSlugs().sort()).toEqual(demos.map((demo) => demo.slug).sort());
    for (const slug of showcaseReleaseSlugs()) expect(publicProjectSlugs()).toContain(slug);
  });

  it("never overclaims: fixture source, no verified claims, no reported metrics", () => {
    for (const entry of showcaseReleases) {
      expect(entry.source).toBe("fixture");
      expect(entry.release.researchClaims.every((claim) => claim.status !== "EXPERIMENT_VERIFIED")).toBe(true);
      const metrics = entry.release.presentation.sections.flatMap((section) => (section.kind === "BENCHMARKS" ? section.metrics : []));
      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics.every((metric) => metric.status === "UNPUBLISHED")).toBe(true);
    }
  });

  it("has no preview for other projects", () => {
    expect(getShowcaseRelease("sorting-lab")).toBeUndefined();
    expect(getShowcaseRelease("not-a-project")).toBeUndefined();
  });
});

describe("release showcase page", () => {
  it.each(showcaseReleaseSlugs())("%s renders labelled as an unpublished fixture", (slug) => {
    const entry = getShowcaseRelease(slug)!;
    const html = renderToStaticMarkup(createElement(ReleaseShowcase, { entry }));
    const text = visibleText(html);
    expect(text).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]/);
    expect(text).toContain("Fixture · 未发布");
    expect(text).toContain("NOT_FOUND");
    // Every presentation section and claim is rendered; metrics show no numbers.
    for (const section of entry.release.presentation.sections) expect(text).toContain(section.title);
    for (const claim of entry.release.researchClaims) expect(text).toContain(claim.topic);
    expect(text).toContain("未发布");
    // The real demo is one click away, and the publication timestamp of a fixture is never shown.
    expect(html).toContain(`href="${demos.find((demo) => demo.slug === slug)!.href}"`);
    expect(text).not.toContain(entry.release.publishedAt);
    expect(text).not.toMatch(/发布于/);
  });

  it("the existing project page links to the preview only when a fixture exists", () => {
    const route = getPublicProject("route-optimizer").data!;
    const withLink = renderToStaticMarkup(createElement(ProjectShowcase, { project: route, related: [], releasePreviewHref: "/explore/route-optimizer/release" }));
    expect(withLink).toContain('href="/explore/route-optimizer/release"');
    expect(withLink).toContain("版本页预览 · Fixture");
    expect(renderToStaticMarkup(createElement(ProjectShowcase, { project: route, related: [] }))).not.toContain("版本页预览");
  });

  it("renders project markdown without raw HTML or images", () => {
    const entry = getShowcaseRelease("route-optimizer")!;
    const hostile = {
      ...entry,
      release: {
        ...entry.release,
        presentation: {
          ...entry.release.presentation,
          sections: [{ id: "overview", kind: "MARKDOWN" as const, title: "概览", body: "安全文本 <script>alert(1)</script> <img src=x onerror=alert(1)> ![图](https://example.com/x.png) [链接](javascript:alert(1))", sourceAssetIds: [] }],
        },
      },
    };
    const html = renderToStaticMarkup(createElement(ReleaseShowcase, { entry: hostile }));
    expect(html).toContain("安全文本");
    expect(html).not.toMatch(/<script|onerror|<img|javascript:/i);
  });
});
