# P1-PUBLIC-META — share previews, robots, sitemap and canonical metadata

Base: `main` `ac6f82b` (2026-11-02, includes #47 dependency patch, #48 landing UX and #49 browser headers). References: third-party review 2026-10-30, items UX-08 (no share preview / site metadata) and SEC-04 (no `security.txt`). The report itself is not in the repository; findings below are checked against current code.

No change to Supabase Auth/session, middleware, RLS, Registry, security headers, CSP policy, landing components, CSS or motion. The only rendering change is what goes into `<head>`.

## 1. Canonical origin

`lib/site.ts` fixes the canonical origin to `https://www.ai-mdc.com` (the apex redirects 308 to it). It is deliberately not read from `NEXT_PUBLIC_SITE_URL`: Preview deployments, the `*.vercel.app` alias and local or CI builds must still point canonical links, sitemaps and share cards at production. The root layout sets it as `metadataBase`.

## 2. Page metadata

| Item | Before | After |
| --- | --- | --- |
| Canonical | Landing only, hard-coded to the root for both languages | Every page: self canonical without query strings (`alternates.canonical: "./"` in the root layout). The landing page canonicalises each language to its own URL. |
| Landing language | English (`/?lang=en`) declared `/` as canonical, so it was folded into the Chinese page | `hreflang` `zh-CN` → `/`, `en` → `/?lang=en`, `x-default` → `/`, in `<head>` and in the sitemap |
| Open Graph | Landing only: title, description, locale, url. No image, no site name | Site-wide defaults: `og:type`, `og:site_name`, `og:locale`, per-page `og:url`, `og:image` with width, height, type and alt. Landing: per-language card, `og:locale:alternate` |
| Twitter/X | None | `summary_large_image`; title, description and image follow Open Graph |
| 404 | Would inherit a canonical of `/_not-found` | No canonical or share tags; Next's `noindex` remains |
| Metadata placement | The landing page streamed `<title>` and all tags into `<body>` for user agents outside Next's built-in bot list (browsers, WeChat, Googlebot) | Always in `<head>` (`htmlLimitedBots: /.*/` in `next.config.ts`; every `generateMetadata` is synchronous data, so blocking has no cost) |

Next 15.5 implementation notes:

- A page-level `openGraph` replaces the layout's object instead of merging it; `features/landing/metadata.ts` restates every field.
- With a `metadataBase`, Next resolves any URL whose path is `/` to the bare origin and drops its query. `/?lang=en` became `/`. The landing page therefore sets `metadataBase: null` and passes absolute URLs, which Next emits verbatim. Unit and HTTP tests pin this.

### Language: current implementation and remaining limits

The landing page picks its language from `?lang=`, then the `aig-lang` cookie, then Chinese. Crawlers carry no cookie, so `/` is Chinese and `/?lang=en` is English for them. A visitor who chose English sees English at `/`; that page then canonicalises to `/?lang=en`, which is the crawlable address of the same content.

Not changed in this scope:

- `<html lang>` stays `zh-CN` on the English page. The root layout is shared by every page and is static; reading the cookie or query there would make the whole site dynamic. The landing wrapper already carries `lang="en"`, so the content language is correct for assistive technology and search engines.
- Path-based locales (`/en`) would fix `<html lang>` and remove query-based language URLs. They change the information architecture and links and are left as a separate product decision (UX-07).

## 3. Share images

`public/og/ai-generator-zh.jpg` and `public/og/ai-generator-en.jpg`, 1200×630, baseline JPEG, 4:4:4, about 66 KiB and 72 KiB.

- Design: the login page's brand panel, unchanged in language: forest ground, the landing "agents" procedural artwork at 70% under the 160° forest veil, the paper spark wordmark, the lime hero headline (`展你所作，守你所藏。` / `Show what you make, keep what you hold.`), a hairline rule, the positioning line and the domain. Only words already on the landing page are drawn; no feature claims, versions or user data.
- Generation: `node --import tsx scripts/generate-og-images.ts`. The script ports the landing fragment shader to the CPU, decodes the site's own WOFF2 fonts (Figtree and the Noto Sans SC slices the text needs, `scripts/og/woff2.ts`) and renders in a child process whose fontconfig sees only those files, so no installed system font can substitute. The output is deterministic.
- Delivery: plain files in `public/`. The middleware matcher skips `.jpg`, so there is no session work and no `Set-Cookie`. All security headers still apply. Rename the files when the artwork changes, because platforms cache by URL.
- The default card (Chinese) applies to every page that does not set its own; the English landing page uses the English card.

## 4. Index boundary

`features/seo/index-policy.ts` is the single source for `app/sitemap.ts` and `app/robots.ts`.

Sitemap (33 URLs): `/`, `/?lang=en`, `/explore`, `/research`, `/demos`, `/docs` and its four pages, the two demos, Explore projects with `PUBLIC` visibility (6), research projects (4) and their experiment records (11). Dynamic URLs come from the same data functions that build the pages: Explore lists `PUBLIC` only; `UNLISTED` pages keep `noindex`, `PRIVATE` pages are 404 and release previews keep `noindex`, so none of them are listed. No `lastmod`, because these pages have no trustworthy per-page date.

Not listed, still crawlable: `/platform/*` (public demo workspace with sample data), `/login`, `/register`, noindex pages (so crawlers can read `noindex`).

`robots.txt`: `Allow: /`; `Disallow:` `/api/`, `/auth/`, `/enter` and the signed-in route families from `lib/auth/return-path.ts` (`/workspace`, `/account`, `/admin`, `/chat`, `/memories`, `/personas`, `/settings`, `/tools`, `/agents`, `/hub`, `/projects`, `/developer`, `/connections`); `Sitemap:` on the canonical origin. robots.txt is crawling advice, not access control. Those routes stay protected by middleware and server authorization, and their names are already public in the open-source repository. Tests assert that no sitemap URL is disallowed and that assets, share images, noindex pages and `/.well-known/` stay crawlable.

## 5. Link-preview compatibility

Locally verified on the production build, by user agent: each fetcher below receives the landing page's title, canonical, Open Graph and Twitter tags inside `<head>`, and the card URL resolves to a public 1200×630 JPEG under 300 KB.

| Platform | Fetcher (user agent) | Local metadata check | Live preview |
| --- | --- | --- | --- |
| Facebook / Messenger | `facebookexternalhit` | Pass | Not verified |
| X (Twitter) | `Twitterbot` | Pass (`summary_large_image`) | Not verified |
| Slack | `Slackbot-LinkExpanding` | Pass | Not verified |
| LinkedIn | `LinkedInBot` | Not exercised; the same all-agents rule applies | Not verified |
| Discord | `Discordbot` | Pass | Not verified |
| Telegram | `TelegramBot (like TwitterBot)` | Pass | Not verified |
| WhatsApp | `WhatsApp/…` | Pass; image under the commonly cited 300 KB limit | Not verified |
| WeChat | `MicroMessenger` | Pass after this change (it was streamed into `<body>` before) | Not verified. WeChat does not document Open Graph support for ordinary web links; custom chat cards need the WeChat JS-SDK with a verified Official Account and a registered JS-safe domain, which this change does not add. |
| Google Search | `Googlebot` | Pass after this change | Not verified (Search Console needed) |

Live previews are not verified: this change is not in production, Preview deployments require Vercel Authentication, and production is currently behind the Vercel Security Checkpoint (section 6). After deployment, check with the Facebook Sharing Debugger, LinkedIn Post Inspector, a Discord or Slack paste, Telegram (`@WebpageBot` refreshes its cache), X post composer, and WeChat (send the link to File Transfer).

## 6. Vercel Security Checkpoint

On 2026-11-02, from this environment, `https://www.ai-mdc.com/` returned **429 with `X-Vercel-Mitigated: challenge`** for every non-browser request: `curl`, browser-like and crawler user agents (Googlebot, Twitterbot, facebookexternalhit, Discordbot, TelegramBot), and also for `/robots.txt`, `/sitemap.xml`, `/.well-known/security.txt` and `/apple-icon.png`. The apex responded the same way. Spoofed crawler user agents from a non-crawler IP are not verified bots, so this does not show what real crawlers receive.

Vercel documents that Attack Challenge Mode lets "known legitimate bots" through. Which layer is active here (Attack Challenge Mode, the Bot Protection managed rule or a custom rule) could not be read: the Vercel connection has no team scope for this project. Whether every preview fetcher above is on Vercel's verified list is also not established. Nothing was changed.

Owner checks:

1. `vercel firewall status` or Dashboard → Firewall: identify the challenging layer and whether it is temporary.
2. If it stays on: decide whether link-preview fetchers must be able to read public HTML. Exempting only static files (`/robots.txt`, `/sitemap.xml`, `/og/*`) does not help previews, because fetchers must read the page's `<head>` first.
3. Google Search Console: URL Inspection and sitemap submission confirm what Googlebot receives.

## 7. security.txt (RFC 9116) — blocked on Owner input

Not published. The repository has no `SECURITY.md`, no disclosure policy and no approved security contact. GitHub private vulnerability reporting is disabled for the repository (read-only API check, 2026-11-02). No contact was invented. The HTTP contract asserts that `/.well-known/security.txt` stays 404 until a real file exists.

RFC 9116 requirements: served over HTTPS at `/.well-known/security.txt` as `text/plain; charset=utf-8`; at least one `Contact` (a `mailto:`, `tel:` or `https:` URI); exactly one `Expires`, recommended less than a year ahead. Optional: `Policy`, `Preferred-Languages`, `Canonical`, `Acknowledgments`, `Encryption`, `Hiring`, and an OpenPGP cleartext signature.

Owner decisions needed:

- Contact channel. Options: enable GitHub private vulnerability reporting and use `https://github.com/ManDik-Chan/AI-Generator/security/advisories/new`; or a dedicated mailbox such as `security@ai-mdc.com` (requires the mailbox). Do not use a personal address unless that is the intent.
- A disclosure policy (for example a `SECURITY.md` with scope, safe harbour and response expectations), referenced by `Policy`.
- Who renews `Expires`, and when.

Template once approved (do not publish with placeholders):

```text
Contact: <approved mailto: or https: URI>
Expires: <YYYY-MM-DDThh:mm:ssZ, at most one year ahead>
Policy: <approved disclosure policy URL>
Preferred-Languages: zh, en
Canonical: https://www.ai-mdc.com/.well-known/security.txt
```

Implementation then: an `app/.well-known/security.txt/route.ts` handler (static, `Content-Type: text/plain; charset=utf-8`) or a `public/.well-known/security.txt` file. Change the contract from 404 to 200 with field checks, and add a renewal reminder before `Expires`. robots.txt already leaves `/.well-known/` crawlable.

## 8. Security and compatibility

- `next.config.ts` `headers()` is unchanged; the existing unit test pins its single `/:path*` route. `htmlLimitedBots` is the only addition.
- The HTTP contract asserts the full header set (nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, CSP Report-Only) on robots.txt, sitemap.xml, the share images, every sitemap page, the landing page in both languages, redirects and the 404, and that HTML CSP stays Report-Only. The existing `scripts/verify-security-headers.ts` regression also passes (17 cases).
- CSP: no new script, style, font, image or connect source. The share images are fetched by external platforms, not loaded by the site. No JSON-LD was added.
- Middleware returns early for these public paths; robots.txt, sitemap.xml and the images set no cookies (asserted).
- `X-Frame-Options: DENY` on the images does not affect link previews (it only governs framing).

## 9. Verification

- Unit (Vitest): landing metadata, sitemap/robots policy and consistency, share image files (format, size, budget, alt text), the WOFF2 decoder (table checksums, `loca`, whole-font checksum), and that metadata stays in `<head>` for all clients.
- HTTP (`scripts/verify-public-meta.ts`, loopback only): 61 requests against `next start`, with the contract in `tests/seo/public-meta-contract.ts`. It covers robots.txt and sitemap.xml syntax and headers, every sitemap URL (200, not noindex, canonical and `og:url` equal to the sitemap URL, card present), the landing page in both languages as eight fetchers, both images (status, type, baseline JPEG, 1200×630, size, no cookie), a static page's inherited defaults, noindex pages, signed-in redirects, the 404 and the absent security.txt.
- CI: `tests/e2e/mobile/public-meta.spec.ts` runs the same contract in the existing remote E2E matrix. It is request-only and opens no page.

Run locally (HTTP only, no browser):

```powershell
pnpm build
node node_modules/next/dist/bin/next start -p 3217 -H 127.0.0.1
node --import tsx scripts/verify-public-meta.ts http://127.0.0.1:3217
```

## 10. Open decisions for the Owner

1. security.txt: contact channel, disclosure policy and `Expires` owner (section 7).
2. Vercel Security Checkpoint scope for crawlers and link-preview fetchers (section 6).
3. Whether sample Explore and Research pages (labelled as samples on the page) should be indexed. They are `PUBLIC` and listed today; excluding them means `noindex`, not only removal from the sitemap.
4. Whether the `/platform` demo workspace should be `noindex` (currently crawlable, not listed).
5. Path-based locales (`/en`) and `<html lang>` for English (UX-07).
6. Policy for AI training crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot …). No rule was added.
