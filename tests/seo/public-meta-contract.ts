import assert from "node:assert/strict";

import { platformPrefixes } from "../../lib/auth/return-path";
import { SITE_ORIGIN } from "../../lib/site";
import { assertSecurityHeaderContract } from "../security/header-contract";

/*
 * HTTP contract for the public site metadata: robots.txt, sitemap.xml, canonical / Open
 * Graph / Twitter tags, share images and the index boundary. Request-only (fetch); it
 * never starts a browser. Shared by scripts/verify-public-meta.ts (local, loopback only)
 * and tests/e2e/mobile/public-meta.spec.ts (remote CI). Imports stay relative and
 * alias-free so both runners resolve them.
 */

/** Preview fetchers whose user agent we exercise. Next blocks metadata into <head> for bots. */
export const PREVIEW_USER_AGENTS = {
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  facebook: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  twitter: "Twitterbot/1.0",
  discord: "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  telegram: "TelegramBot (like TwitterBot)",
  slack: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  whatsapp: "WhatsApp/2.23.20.0",
  wechat: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 XWEB/1160117 MMWEBSDK/20240404 MicroMessenger/8.0.49.2600(0x2800313D) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64",
} as const;

const ROBOTS_DISALLOW = ["/api/", "/auth/", "/enter", ...platformPrefixes];
const decode = (value: string) => value.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function tags(html: string, name: "meta" | "link") {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map(([tag]) =>
    Object.fromEntries([...tag.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)].map(([, key, value]) => [key.toLowerCase(), decode(value)])),
  );
}

/** Parsed head metadata. `scope: "head"` ignores anything streamed after </head>. */
export function readMetadata(html: string, scope: "head" | "document" = "document") {
  const source = scope === "head" ? html.slice(0, Math.max(0, html.search(/<\/head>/i))) : html;
  const metas = tags(source, "meta");
  const links = tags(source, "link");
  const all = (key: string) => metas.filter((m) => m.property === key || m.name === key).map((m) => m.content);
  return {
    title: decode(source.match(/<title>([^<]*)<\/title>/i)?.[1] ?? ""),
    htmlLang: html.match(/<html[^>]*\slang="([^"]+)"/i)?.[1],
    canonical: links.find((l) => l.rel === "canonical")?.href,
    hreflang: Object.fromEntries(links.filter((l) => l.rel === "alternate" && l.hreflang).map((l) => [l.hreflang, l.href])),
    robots: all("robots").join(","),
    og: (key: string) => all(`og:${key}`),
    twitter: (key: string) => all(`twitter:${key}`),
  };
}

/** Width/height of a JPEG from its SOF segment, and whether it is progressive. */
export function jpegInfo(bytes: Uint8Array) {
  assert.ok(bytes[0] === 0xff && bytes[1] === 0xd8, "not a JPEG");
  let i = 2;
  while (i + 9 < bytes.length) {
    assert.equal(bytes[i], 0xff, "corrupt JPEG marker");
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8], progressive: marker === 0xc2 };
    }
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  throw new Error("JPEG has no frame header");
}

const same = (a: string | undefined, b: string) => a !== undefined && new URL(a).href === new URL(b).href;

export async function verifyPublicMeta(baseUrl: string | URL) {
  const base = new URL(baseUrl);
  const results: { path: string; status: number }[] = [];
  const get = async (path: string, userAgent?: string) => {
    const response = await fetch(new URL(path, base), {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: userAgent ? { "User-Agent": userAgent } : undefined,
    });
    assertSecurityHeaderContract(response.headers);
    results.push({ path, status: response.status });
    return response;
  };
  const html = async (path: string, userAgent?: string) => {
    const response = await get(path, userAgent);
    assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
    assert.equal(response.headers.get("content-security-policy"), null, `${path}: CSP must stay Report-Only`);
    return response.text();
  };
  const local = (absolute: string) => {
    const url = new URL(absolute);
    assert.equal(url.origin, SITE_ORIGIN, `${absolute} must use the canonical origin`);
    return `${url.pathname}${url.search}`;
  };

  // robots.txt: advice only, plain text, no session.
  const robots = await get("/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get("content-type") ?? "", /^text\/plain/);
  assert.equal(robots.headers.get("set-cookie"), null);
  const robotsLines = (await robots.text()).split(/\r?\n/).map((line) => line.trim());
  assert.ok(robotsLines.includes("User-Agent: *"));
  assert.ok(robotsLines.includes("Allow: /"));
  for (const rule of ROBOTS_DISALLOW) assert.ok(robotsLines.includes(`Disallow: ${rule}`), `robots.txt must disallow ${rule}`);
  assert.ok(robotsLines.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`));

  // sitemap.xml: absolute canonical URLs only, never a signed-in or noindex page.
  const sitemap = await get("/sitemap.xml");
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("content-type") ?? "", /^application\/xml/);
  assert.equal(sitemap.headers.get("set-cookie"), null);
  const xml = await sitemap.text();
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9" xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml">/);
  assert.match(xml, /<\/urlset>\s*$/);
  assert.doesNotMatch(xml.replace(/&(?:amp|lt|gt|quot|apos);/g, ""), /&/, "sitemap must escape ampersands");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => decode(loc));
  assert.equal(locs.length, (xml.match(/<url>/g) ?? []).length);
  assert.equal(new Set(locs).size, locs.length, "sitemap URLs must be unique");
  assert.ok(locs.length > 10);
  for (const loc of locs) {
    const path = local(loc);
    const pathname = new URL(loc).pathname;
    assert.ok(!ROBOTS_DISALLOW.some((rule) => pathname.startsWith(rule)), `${loc} is disallowed by robots.txt`);
    assert.doesNotMatch(pathname, /^\/(?:platform|login|register)(?:\/|$)/, `${loc} must not be promoted`);
    const meta = readMetadata(await html(path, PREVIEW_USER_AGENTS.googlebot), "head");
    assert.doesNotMatch(meta.robots, /noindex/, `${loc} is in the sitemap but noindex`);
    assert.ok(same(meta.canonical, loc), `${loc}: canonical is ${meta.canonical}`);
    assert.ok(same(meta.og("url")[0], loc), `${loc}: og:url is ${meta.og("url")[0]}`);
    assert.ok(meta.og("title")[0] && meta.og("description")[0], `${loc}: og:title/description missing`);
    assert.match(meta.og("image")[0] ?? "", new RegExp(`^${SITE_ORIGIN.replace(/\./g, "\\.")}/og/[a-z0-9-]+\\.jpg$`));
    assert.equal(meta.twitter("card")[0], "summary_large_image");
  }
  for (const lang of ["zh-CN", "en", "x-default"]) assert.match(xml, new RegExp(`<xhtml:link rel="alternate" hreflang="${lang}" href="`));

  // Landing page in both languages, as each preview fetcher sees it in <head>.
  const images = new Set<string>();
  for (const [path, lang] of [["/", "zh"], ["/?lang=en", "en"]] as const) {
    for (const [agent, userAgent] of Object.entries(PREVIEW_USER_AGENTS)) {
      const meta = readMetadata(await html(path, userAgent), "head");
      const where = `${path} as ${agent}`;
      assert.ok(same(meta.canonical, `${SITE_ORIGIN}${path}`), `${where}: canonical ${meta.canonical}`);
      assert.deepEqual(Object.keys(meta.hreflang).sort(), ["en", "x-default", "zh-CN"], `${where}: hreflang`);
      assert.ok(same(meta.hreflang.en, `${SITE_ORIGIN}/?lang=en`) && same(meta.hreflang["zh-CN"], `${SITE_ORIGIN}/`), `${where}: hreflang targets`);
      assert.equal(meta.og("type")[0], "website");
      assert.equal(meta.og("site_name")[0], "AI-Generator");
      assert.equal(meta.og("locale")[0], lang === "zh" ? "zh_CN" : "en_US");
      assert.deepEqual(meta.og("locale:alternate"), [lang === "zh" ? "en_US" : "zh_CN"]);
      assert.ok(same(meta.og("url")[0], `${SITE_ORIGIN}${path}`));
      assert.ok(meta.title && meta.og("title")[0] === meta.title, `${where}: og:title must match <title>`);
      assert.ok((meta.og("description")[0] ?? "").length > 20);
      assert.equal(meta.og("image")[0], `${SITE_ORIGIN}/og/ai-generator-${lang}.jpg`);
      assert.deepEqual([meta.og("image:width")[0], meta.og("image:height")[0], meta.og("image:type")[0]], ["1200", "630", "image/jpeg"]);
      assert.match(meta.og("image:alt")[0] ?? "", /^AI-Generator/);
      assert.equal(meta.twitter("card")[0], "summary_large_image");
      assert.equal(meta.twitter("image")[0], meta.og("image")[0]);
      assert.equal(meta.twitter("title")[0], meta.og("title")[0]);
      images.add(local(meta.og("image")[0]));
    }
  }

  // Share images: public, cookie-free, 1200x630 baseline JPEG under common size limits.
  for (const path of images) {
    const image = await get(path, PREVIEW_USER_AGENTS.facebook);
    assert.equal(image.status, 200, `${path}: HTTP ${image.status}`);
    assert.equal(image.headers.get("content-type"), "image/jpeg");
    assert.equal(image.headers.get("set-cookie"), null);
    const bytes = new Uint8Array(await image.arrayBuffer());
    assert.ok(bytes.length < 300 * 1024, `${path}: ${bytes.length} bytes`);
    assert.deepEqual(jpegInfo(bytes), { width: 1200, height: 630, progressive: false });
  }

  // A static page inherits the site defaults with its own canonical and title.
  const docs = readMetadata(await html("/docs/api", PREVIEW_USER_AGENTS.discord), "head");
  assert.ok(same(docs.canonical, `${SITE_ORIGIN}/docs/api`));
  assert.ok(docs.og("title")[0]?.startsWith("API Reference"));
  assert.equal(docs.og("image")[0], `${SITE_ORIGIN}/og/ai-generator-zh.jpg`);
  assert.equal(docs.og("locale")[0], "zh_CN");

  // Index boundary: unlisted showcase and release previews stay noindex; signed-in pages redirect.
  for (const path of ["/explore/air-quality", "/explore/route-optimizer/release"]) {
    assert.match(readMetadata(await html(path)).robots, /noindex/, `${path} must stay noindex`);
    assert.ok(!locs.some((loc) => new URL(loc).pathname === path), `${path} must not be in the sitemap`);
  }
  assert.doesNotMatch(xml, /\/release</, "release previews must not be in the sitemap");
  for (const path of ["/workspace", "/developer/registry", "/projects"]) {
    const response = await get(path);
    assert.ok([303, 307].includes(response.status), `${path}: HTTP ${response.status}`);
    assert.match(response.headers.get("location") ?? "", /\/login\?/);
  }

  // A missing page is noindex and claims no canonical address or share card.
  const missing = await get("/__public_meta_missing_page__", PREVIEW_USER_AGENTS.twitter);
  assert.equal(missing.status, 404);
  const missingMeta = readMetadata(await missing.text(), "head");
  assert.match(missingMeta.robots, /noindex/);
  assert.equal(missingMeta.canonical, undefined);
  assert.deepEqual([missingMeta.og("url"), missingMeta.og("image"), missingMeta.twitter("card")], [[], [], []]);

  // No security.txt is published until the Owner approves a contact (RFC 9116 requires one).
  const securityTxt = await get("/.well-known/security.txt");
  assert.equal(securityTxt.status, 404);
  await securityTxt.body?.cancel();

  return { checked: results.length, sitemapUrls: locs.length, images: [...images] };
}
