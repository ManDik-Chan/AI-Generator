/*
 * The public experience loop: landing → runnable demos → developer docs → platform, and
 * back from the signed-in or demo workspace to the demos and docs. Each test pins one hop
 * so a removed link fails here instead of leaving a dead end on the site.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { activeSiteLink, siteLinks } from "@/components/site/site-nav";
import { demos } from "@/features/demos/catalog";
import { demoNextSteps } from "@/features/demos/components/demo-page";
import { landingCopy } from "@/features/landing/content";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const linksIn = (source: string) => new Set([...source.matchAll(/["'`](\/[^"'`\s]*)["'`]/g)].map((match) => match[1]));

describe("experience loop", () => {
  it("the landing page leads to the demos, the docs and the demo workspace in both languages", () => {
    for (const lang of ["zh", "en"] as const) {
      const hrefs = new Set(landingCopy[lang].footer.cols.flatMap((col) => col.links.map((link) => link.href)));
      for (const href of ["/demos", "/docs", "/platform", "/explore"]) expect(hrefs.has(href), `${lang} ${href}`).toBe(true);
    }
    const page = linksIn(read("features/landing/components/landing-page.tsx"));
    expect(page.has("/demos")).toBe(true);
  });

  it("the demo index opens both demos", () => {
    expect(demos.map((demo) => demo.href)).toEqual(["/demos/route-optimizer", "/demos/neural-network"]);
    expect(read("app/demos/page.tsx")).toContain("href={demo.href}");
  });

  it.each(demos)("after running $name the visitor reaches its project page, research record, docs and the platform", (demo) => {
    const docsHref = demo.execution === "server" ? "/docs/api#route-optimizer-solve" : "/docs/guide#浏览器运行时";
    const page = read(`app/demos/${demo.slug}/page.tsx`);
    expect(page).toContain(`<DemoNextSteps demo={demo} docsHref="${docsHref}" />`);
    expect(page).toContain(`<DemoPageHeader demo={demo} docsHref="${docsHref}" />`);
    expect(demoNextSteps(demo, docsHref).map((step) => step.href)).toEqual([`/explore/${demo.slug}`, `/research/${demo.slug}`, docsHref, "/platform"]);
  });

  it("the docs link back to both demos", () => {
    const shell = linksIn(read("features/docs/components/docs-shell.tsx"));
    for (const demo of demos) expect(shell.has(demo.href), demo.href).toBe(true);
  });

  it("the workspace shell reaches the public demos, docs and site", () => {
    const footer = linksIn(read("components/layout/app-shell.tsx"));
    const palette = linksIn(read("components/layout/command-palette.tsx"));
    for (const href of ["/", "/explore", "/demos", "/docs"]) expect(footer.has(href), `footer ${href}`).toBe(true);
    for (const href of ["/", "/demos", "/docs"]) expect(palette.has(href), `palette ${href}`).toBe(true);
  });

  it("the public header reaches the platform, the demos and login", () => {
    expect(siteLinks.map((link) => link.href)).toEqual(expect.arrayContaining(["/demos", "/docs", "/platform"]));
    expect(linksIn(read("components/site/site-chrome.tsx")).has("/login")).toBe(true);
  });

  it("labels footer links that need an account", () => {
    expect(read("components/site/site-footer.tsx")).toContain('title: "AI Hub · 登录后使用"');
    expect(landingCopy.zh.footer.cols.find((col) => col.links.some((link) => link.href === "/chat"))?.title).toContain("登录");
    expect(landingCopy.en.footer.cols.find((col) => col.links.some((link) => link.href === "/chat"))?.title).toContain("sign-in");
  });

  it("the 404 and error pages offer a way back for signed-out visitors", () => {
    for (const file of ["app/not-found.tsx", "app/error.tsx"]) {
      const hrefs = linksIn(read(file));
      expect(hrefs.has("/"), file).toBe(true);
      expect(hrefs.has("/workspace"), file).toBe(true);
    }
  });
});

describe("public header active state", () => {
  it("marks exactly one link, the most specific one", () => {
    expect(activeSiteLink("/platform/hub")).toBe("/platform/hub");
    expect(activeSiteLink("/platform/projects/sorting-lab")).toBe("/platform");
    expect(activeSiteLink("/demos/neural-network")).toBe("/demos");
    expect(activeSiteLink("/docs/api")).toBe("/docs");
    expect(activeSiteLink("/developer")).toBeUndefined();
    expect(activeSiteLink("/")).toBeUndefined();
  });

  it("includes the home entry of the mobile menu only on the home page", () => {
    const menu = ["/", ...siteLinks.map((link) => link.href)];
    expect(activeSiteLink("/", menu)).toBe("/");
    expect(activeSiteLink("/explore/sorting-lab", menu)).toBe("/explore");
  });
});
