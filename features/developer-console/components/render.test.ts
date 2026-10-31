/*
 * Server-renders every console screen in Node. Browser automation is paused for this
 * repository (AGENTS.md), so this is the check that each screen renders without throwing,
 * prints no undefined/NaN, labels its mock data, and produces the same markup on every
 * render (the mock clock is fixed until the page is interactive).
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccessView } from "@/features/developer-console/components/access-view";
import { ConsoleHeader } from "@/features/developer-console/components/console-header";
import { ConsoleProvider } from "@/features/developer-console/components/console-provider";
import { IntegrateView } from "@/features/developer-console/components/integrate-view";
import { ReleaseDesk } from "@/features/developer-console/components/release-desk";
import { Workbench } from "@/features/developer-console/components/workbench";
import { consoleProjectSlugs } from "@/features/developer-console/mock/seed";

const base = "/platform/developer";
const render = (page: ReactElement) => renderToStaticMarkup(createElement(ConsoleProvider, null, createElement(ConsoleHeader, { base }), page));
const visibleText = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");

function expectClean(html: string) {
  const text = visibleText(html);
  expect(text).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]/);
  expect(html).toContain("Mock 数据源");
}

describe("developer console screens render on the server", () => {
  it("workbench lists every mock project and the live demos", () => {
    const html = render(createElement(Workbench, { base, projectsBase: "/platform/projects" }));
    expectClean(html);
    for (const slug of consoleProjectSlugs()) expect(html).toContain(`${base}/projects/${slug}`);
    expect(html).toContain("/demos/route-optimizer");
    expect(html).toContain("接口就绪度");
  });

  it.each(consoleProjectSlugs())("release desk for %s", (slug) => {
    const html = render(createElement(ReleaseDesk, { slug, base, projectsBase: "/platform/projects" }));
    expectClean(html);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("协议日志");
    expect(render(createElement(ReleaseDesk, { slug, base, projectsBase: "/platform/projects" }))).toBe(html); // deterministic
  });

  it("the uninitialized draft explains DRAFT_UNINITIALIZED instead of showing a form", () => {
    const html = render(createElement(ReleaseDesk, { slug: "research-notes", base, projectsBase: "/platform/projects" }));
    expect(html).toContain("草稿尚未初始化");
    expect(html).toContain("DRAFT_UNINITIALIZED");
  });

  it("a pending review shows a countdown and the self-review rule for its submitter", () => {
    const html = render(createElement(ReleaseDesk, { slug: "air-quality", base, projectsBase: "/platform/projects" }));
    expect(html).toContain("剩 12:00");
    expect(html).toContain("需要「审核」角色");
  });

  it("integration page lists the live Demo API from its OpenAPI builder", () => {
    const html = renderToStaticMarkup(createElement(IntegrateView, { base }));
    expect(visibleText(html)).not.toMatch(/\bundefined\b|\bNaN\b/);
    expect(html).toContain("/api/demo/v1/capabilities");
    expect(html).toContain("createRun");
    expect(html).toContain('id="manifest"');
  });

  it("access page shows the DTO fields read from the merged contracts", () => {
    const html = render(createElement(AccessView, { base, connectionsHref: "/platform/connections" }));
    expectClean(html);
    for (const field of ["revision", "payload", "contentHash", "hashAlgorithm", "publishedAt"]) expect(html).toContain(field);
    expect(html).not.toMatch(/>ownerId</);
  });
});
