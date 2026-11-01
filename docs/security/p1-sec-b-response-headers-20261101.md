# P1-SEC-HARDEN B — browser response headers

Base: `0c13efe` (2026-11-01 main, including PR #46). The Draft PR records the final candidate SHA and CI results; local evidence below must not be read as remote browser acceptance.
This branch is independent of dependency patch A. It changes no dependencies, Auth/session implementation, business permissions, UI, deployment settings, workflows, or browser matrix.

## Effective configuration boundaries

- Application: `next.config.ts` now applies `/:path*` response headers before route/filesystem handling, using `lib/security/headers.ts`. It covers application HTML, normal redirects, errors, APIs, RSC, and static files without modifying Supabase middleware or forcing dynamic rendering. Existing route-specific content type and cache behavior remain authoritative.
- Supabase SSR: `middleware.ts` delegates session refresh and redirects to the existing middleware. It does not own the baseline header policy. Browser SDK Auth calls and signed storage image redirects use the exact configured `NEXT_PUBLIC_SUPABASE_URL` origin. Supabase's own responses are outside this application's header control.
- Platform: read-only Vercel metadata confirmed Next.js / Node 22, no project custom routes (`routes=[]`, `version=null`), and SSO protection except custom domains. The project lists `ai-mdc.com` redirecting 308 to `www.ai-mdc.com`, the direct www domain, and a Vercel alias. No platform settings were changed and no secrets were read.
- Public HEAD checks to apex, www, login, and a nonexistent path received **429 `x-vercel-mitigated: challenge`** from the edge. These are not application responses and cannot establish the deployed application's headers. The challenge was not bypassed. Vercel challenge, SSO, domain redirects, and platform-generated errors can precede application policy; the Owner must review those separately.

## Enforced baseline and reporting candidate

| Header | Choice and functional review |
| --- | --- |
| `X-Content-Type-Options` | `nosniff`; retain correct JS/CSS/image/JSON/SSE types. |
| `X-Frame-Options` | `DENY`; source has no iframe/embed contract or active third-party framed preview. This is the actual clickjacking protection. External consumers / Vercel tooling that embed the app remain an Owner compatibility check. |
| `Referrer-Policy` | `strict-origin-when-cross-origin`; cross-origin navigation omits private paths/query, while same-origin app navigation retains ordinary behavior. |
| `Permissions-Policy` | Deny camera, microphone, geolocation, payment, USB and motion sensors; current upload controls use file selection, not camera capture. Deny clipboard reading; preserve `clipboard-write=(self)` for copy buttons and `fullscreen=(self)` for future compatible same-origin use. Browser support varies; this does not replace permission prompts or authorization. |
| `Content-Security-Policy-Report-Only` | Strict source inventory candidate; **reports only and does not block execution, loads, forms, or framing**. It contains no `unsafe-inline`, `unsafe-eval`, broad scheme allowance, or wildcard host. |

Report-Only `frame-ancestors` cannot enforce clickjacking protection. Its reporting support has varied across browser versions; this candidate omits it and XFO supplies the enforced protection. CSP3 reporting support must not be confused with blocking. HSTS, `includeSubDomains`, preload, COOP, COEP and CORP are not added: a complete domain/HTTPS inventory is unavailable and popup/preview/third-party compatibility has not been established. Existing platform HSTS is not overwritten.

## Source inventory

| Resource / feature | Candidate allowance and evidence |
| --- | --- |
| JS | Same-origin Next bundles. A SHA-256 source hash is calculated from the existing `lib/theme.ts` bootstrap string used by `app/layout.tsx`; no UI edit or static nonce. Other Next inline Flight/hydration scripts still report. |
| CSS / fonts | Same-origin built CSS and local Figtree / Noto Sans fonts (`app/layout.tsx`, `app/fonts/noto-sans-sc.css`). React inline style attributes and Lenis/artwork style updates remain expected observation gaps. GSAP is a dependency but no active source import was found. |
| Images / previews | Same origin, `blob:` for upload preview and generated artwork (`image-analyzer.tsx`, `features/landing/art.ts`), and the exact configured Supabase origin for signed storage redirects (`app/api/tools/assets`, generated images, persona avatars). No `data:` image need was found, so it is not allowed. |
| Auth / API / SSE / RSC / uploads | Same-origin API, Server Action, RSC and fetch/SSE transports plus the exact Supabase HTTP(S) origin for browser SDK requests. Server-side AI provider origins do not belong in browser CSP. No active WebSocket/Realtime subscription was found. |
| Workers | `worker-src 'self'` for the neural-network demo's emitted worker chunk (`use-neural-trainer.ts`). A main-thread fallback must not be mistaken for proof that worker loading succeeds. |
| Auth callback / OAuth / external links | Current PKCE callback exchanges the code on the server and redirects to a validated same-origin path. Forms submit to self. Source has no OAuth-provider launch button, popup, or opener handling; ordinary top-level documentation links do not need a connect/frame exception. Real provider configuration and an end-to-end OAuth flow remain unverified. |
| Frames / media / active objects | None found in current source; reporting candidate uses `frame-src 'none'`, `media-src 'none'`, and `object-src 'none'`. Planned sandboxed project embeds need a separate origin and compatibility review. |

Supabase URL parsing accepts only HTTP(S), rejects credentials and non-DNS/IP hostname punctuation/wildcards, and serializes only the origin. Paths, queries, fragments and raw environment text cannot enter the source list. Build-time configuration changes require a rebuild. Markdown currently can render arbitrary remote images; those should report for review, not trigger a blanket `https:` allowance. Historical external avatar sources and platform-injected preview scripts also require real runtime observation.

## Nonce / hash decision and enforcement path

The fixed theme bootstrap can use its exact hash now. Next.js 15 nonce propagation requires fresh per-request nonces and dynamic rendering; adopting it broadly would change static optimization, ISR/CDN behavior and caching. This branch preserves the existing rendering strategy. Experimental webpack SRI hashes cover external JS assets, not a complete solution for variable inline Flight scripts or React style attributes, so SRI is not enabled as an implied enforcement fix.

**This CSP is not ready for enforcement.** Before enforcement, collect representative public/authenticated/error/OAuth/upload/SSE/RSC/worker/preview observations, map each remaining inline script/style source, and choose route-specific dynamic nonces or verified per-build hashes with a reviewed cache strategy. Remove or narrowly redesign incompatible style attributes without changing the UI without coordination. Do not promote this header by simply renaming it, adding blanket `unsafe-inline`, or allowing all external sources.

## Bounded reporting and test diagnostics

`report-uri /api/security/csp-report` uses the browser-compatible legacy reporting path; the endpoint also understands Reporting API batches. It is anonymous, best effort telemetry, not durable analytics or an abuse-prevention boundary. It reads at most 16 KiB with a two-second deadline and at most eight reports per batch. A fixed-memory per-process budget accepts at most 60 requests per minute; over-budget requests return an empty 204 without parsing or logging, avoiding resource-error noise during legitimate inline-report bursts. Sampling, process restarts and platform distribution mean report counts are incomplete.

Only fixed-vocabulary directive, `report` disposition and blocked-resource class (`inline`, `eval`, `self`, external HTTP/S, other) are logged. No document/source/blocked URL, OAuth code, signed storage query, cookie, IP, request body, or script sample is retained or reflected. Invalid type/body/disposition is rejected with an empty response. Reports are attacker-controlled claims and cannot drive authorization or alerts without independent evidence.

Chromium emits Report-Only observations at info level; WebKit emits them as console errors. CI retains the same zero **unexpected** runtime-error assertions and raw attachments. The diagnostics helper pairs exact known inline script/style Report-Only console signatures one-for-one with trusted `securitypolicyviolation` events from the exact candidate policy and same-origin document/source/frame. It drains event/binding delivery before assertions. Unknown/malformed policy or message, missing/unpaired event, external/eval/enforcing violation, page error and extra console error still fail. Raw event locators are reduced to origins/categories; no global CSP substring suppression or browser skip is introduced. Exact engine signature and source-location behavior must pass the real unchanged CI browser matrix before acceptance.

## Validation

| Check | State |
| --- | --- |
| Frozen install | Passed locally. |
| Header/origin and bounded-report unit tests; diagnostic negative tests | Passed locally as part of the full unit suite. |
| Typecheck / Lint / full Unit | Passed locally; 1,463 unit tests, zero failures or skips. |
| Production build | Passed locally with isolated public Supabase configuration. |
| HTTP contract: pages, redirects, 404, 400/405 API errors, assets, RSC, image optimizer | Passed locally: 16/16 actual responses. No deliberate fault/500 route is introduced; forced 500 response behavior was not separately exercised. |
| Authenticated HTTP runtime and headers | Passed locally: login/SSR, Server Actions, RSC, SSE, image upload/processing and private image access, Registry authorization, session refresh and sign-out. |
| Existing isolated Supabase security acceptance | Passed locally: 184 real integration tests. |
| Real browser Report-Only event, actual XFO denial, interactivity and unchanged browser matrix | Authored; remote CI pending. Local browsers remain suspended by `AGENTS.md`. |
| Live application / platform error headers | Unverified: public edge challenge prevented observation. |

Checks ran serially against disposable stack `aig-platform-p1-final-sec-a-20261101`, API `127.0.0.1:60921` / database `127.0.0.1:60922`, reused from A after its validation. Test configuration was passed through the process environment, without creating an environment file or using production credentials. The standalone HTTP runner uses `async main().catch(...)` for the repository's tsx/CommonJS execution mode.

Execution commands are in [README](../../README.md#security-response-header-verification). The Draft PR is the record for the final tested head and CI run links. Owner actions: merge A first, require all B CI/browser gates on the final main-compatible candidate, review observed source exceptions and Vercel-generated response headers, and retain a separate decision for CSP enforcement, HSTS/subdomains and isolation headers. No main merge or production deployment is performed here.

Official references: [Next 15 headers](https://nextjs.org/docs/15/app/api-reference/config/next-config-js/headers), [Next 15 CSP / nonce and SRI](https://nextjs.org/docs/15/app/guides/content-security-policy), [CSP3 reporting and delivery specification](https://www.w3.org/TR/CSP3/), [WebKit CSP implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/csp/ContentSecurityPolicy.cpp), [Chromium CSP report severity](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/frame/csp/csp_directive_list.cc).
