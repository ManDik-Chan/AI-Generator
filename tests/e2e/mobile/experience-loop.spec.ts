import { expect, test, type APIRequestContext } from "@playwright/test";

// Existing CI matrix only; this file grants no local browser permission. Request-only:
// it uses no page fixture, so no browser is launched for it.
test.use({ storageState: { cookies: [], origins: [] } });

/*
 * The public experience loop as served by the production build, signed out:
 * landing → demos → each demo → its docs, project page, research record and the demo
 * workspace → back to the demos and docs. Detail pages under /explore and /research are
 * only checked as links here: global setup signs in first, after which this shared
 * `next start` server answers 404 for `dynamicParams = false` pages (see public-meta.spec.ts).
 */

async function html(request: APIRequestContext, path: string, status = 200) {
  const response = await request.get(path, { maxRedirects: 0 });
  expect(response.status(), path).toBe(status);
  return response.text();
}

function expectLink(body: string, href: string, where: string) {
  const [path, hash] = href.split("#");
  const variants = hash ? [href, `${path}#${encodeURIComponent(hash)}`] : [href];
  expect(variants.some((variant) => body.includes(`href="${variant}"`)), `${where} links to ${href}`).toBe(true);
}

function expectId(body: string, id: string, where: string) {
  expect(body.includes(`id="${id}"`), `${where} has #${id}`).toBe(true);
}

const demos = [
  { href: "/demos/route-optimizer", slug: "route-optimizer", docs: "/docs/api#route-optimizer-solve" },
  { href: "/demos/neural-network", slug: "neural-network", docs: "/docs/guide#浏览器运行时" },
];

test("signed out, a visitor can go from the landing page through both demos to the docs and back to the platform", async ({ request }) => {
  test.setTimeout(120_000);

  const landing = await html(request, "/");
  for (const href of ["/demos", "/docs", "/platform"]) expectLink(landing, href, "/");

  const index = await html(request, "/demos");
  for (const demo of demos) expectLink(index, demo.href, "/demos");
  expectLink(index, "/docs/guide", "/demos");

  for (const demo of demos) {
    const page = await html(request, demo.href);
    for (const href of [demo.docs, `/explore/${demo.slug}`, `/research/${demo.slug}`, "/platform", "/demos"]) expectLink(page, href, demo.href);
  }

  const api = await html(request, "/docs/api");
  for (const id of ["route-optimizer-solve", "capabilitydescriptor"]) expectId(api, id, "/docs/api");
  const guide = await html(request, "/docs/guide");
  for (const id of ["浏览器运行时", "服务端能力"]) expectId(guide, id, "/docs/guide");
  for (const demo of demos) expectLink(guide, demo.href, "/docs/guide");

  const workspace = await html(request, "/platform");
  for (const href of ["/demos", "/docs", "/explore", "/"]) expectLink(workspace, href, "/platform");
});

test("a missing page answers 404 with a way back that works signed out", async ({ request }) => {
  const body = await html(request, "/demos/does-not-exist", 404);
  expect(body).toContain("这个页面不在这里");
  expectLink(body, "/", "404");
  expectLink(body, "/workspace", "404");
});
