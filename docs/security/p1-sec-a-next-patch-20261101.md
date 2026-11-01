# P1-SEC-HARDEN A — Next.js maintenance security patch

Audit date: 2026-11-01. Base: `0c13efe` (`origin/main`, including PR #46).
Final candidate SHA and CI evidence: pending; update before acceptance.

This package updates dependencies on the existing Next.js 15.5 / React 19.1 lines. It does not change App Router, Auth/session behavior, business permissions, deployment settings, production Supabase, or UI implementation. The referenced 2026-10-30 third-party report was not located locally and was not inspected; conclusions below use current source, lockfile, npm metadata, and official advisories.

## Versions and dependency provenance

| Dependency | Base / locked version | Candidate / locked version |
| --- | --- | --- |
| `next` | 15.5.20 | 15.5.28 |
| `eslint-config-next` / `@next/eslint-plugin-next` | 15.5.20 | 15.5.28 |
| `@next/env` / platform SWC packages | 15.5.20 | 15.5.28 |
| `react` / `react-dom` | 19.1.8 | 19.1.10 |
| Direct `sharp` | `^0.35.3` / 0.35.3 | 0.35.5 / 0.35.5 |
| Workspace `sharp` override | 0.35.3 | 0.35.5 |
| Platform `@img/sharp-*` packages | 0.35.3 | 0.35.5 |
| Optional `@img/sharp-libvips-*` packages | 1.3.2 | 1.3.4 |

The npm registry contained no newer stable 15.5, 19.1, or 0.35 patch at audit time. Sharp is pinned in both the direct dependency and workspace override: the old override would otherwise force the vulnerable version despite upgrading Next.js. The lockfile resolves Next.js's optional Sharp and the application import to the same 0.35.5 release. The libvips rows identify npm binary-package versions, not the native library's runtime version. Retain the existing PostCSS override and package build allowlist.

The lockfile has no separately managed `react-server-dom-*` dependency. Next.js ships its RSC implementation in `next/dist/compiled`; the security provenance is the framework patch, not the root `react` version alone. Internal RSC package metadata retains a canary peer-version string and is not a reliable patch-version test. React/ReactDOM move together within 19.1; no independent override of Next.js's bundled RSC is introduced.

Official release: [Next.js October 14 security update](https://nextjs.org/blog/nextjs-security-update-october-14-2026), [15.5.28 release](https://github.com/vercel/next.js/releases/tag/v15.5.28).

## Potential impact and fixed risks

| Official advisory | Base exposure / source evidence | Candidate coverage |
| --- | --- | --- |
| [GHSA-p3m5-59mp-jv5r — Server Actions DoS](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r) | App Router with `use server` actions in `features/{auth,chat,memory,persona,tools,admin}/actions.ts`; crafted requests can exhaust CPU before business logic completes. | 15.5.28 is the official 15.5 fix. |
| [GHSA-2464-fhr4-w9xw / CVE-2026-96889 — SVG image-processing RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw) | Native image stack risk on glibc Linux. `next.config.ts` does not globally disable the optimizer. `features/persona/components/avatar-picker.tsx` uses the default Next Image loader. Upload restrictions reduce reachable input formats but do not substitute for patching. | Next 15.5.28 plus actual Sharp 0.35.5, including its override and native packages. |
| [GHSA-m99w-x7hq-7vfj / CVE-2026-64641 — July Server Actions DoS](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj) | 15.5.20 predates the July 15.5.21 fix; the same App Router/Server Actions condition exists. | Included cumulatively. |
| [GHSA-955p-x3mx-jcvp / CVE-2026-64643 — internal Server Function endpoint disclosure](https://github.com/vercel/next.js/security/advisories/GHSA-955p-x3mx-jcvp) | App Router/action references exist. Existing authenticated business actions call `requireUser` / `requireAdmin` inside the action boundary; action identifiers are not an authorization control. | Includes 15.5.21 fix; preserve application authorization. |
| [GHSA-p293-qw3h-jr36 / CVE-2026-75604 — Windows-hosted RCE](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) | Relevant when this App Router server runs on a Windows filesystem, including local `next start`; no Cache Components are configured. Production host details are not inferred from the local OS. | Includes 15.5.24 fix. |
| [GHSA-2xp9-vwfh-vxw4 — AVIF optimization RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) | Base predates the framework mitigation; application upload code rejects AVIF. | Includes 15.5.24 optimization mitigation and newer Sharp binaries. |
| [GHSA-673q-mjm6-r5xr — typed-array Cache Components RCE](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) | The Next.js advisory lists 16.0.0–16.4.0, not 15.5. No `use cache`, `cacheComponents`, or `experimental.useCache` was found. Do not report confirmed exposure for this project. | Remain on patched 15.5; no migration to 16. |

The related React advisories [GHSA-h3gv-c5rc-p453](https://github.com/react/react/security/advisories/GHSA-h3gv-c5rc-p453) and [GHSA-xqc2-xf4c-x3h3](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3) name the RSC packages and fixed 19.1.10 line. Next.js's own affected ranges and framework release govern this application's bundled RSC assessment.

Static review found no external dynamic-host rewrite/redirect, custom server, Edge-runtime Server Action, Pages Router, root catch-all page, `next/og` / `ImageResponse`, remote-image allowlist, or Cache Components configuration matching the other July–September conditional advisories. The Registry API catch-all is an API handler, not a root catch-all page. No mismatched `fetch(new Request(...), differentInit)` or non-UTF-8 request-body caching pattern was found. These are source-review observations, not proof of absence under every deployment configuration.

## Compatibility and retained controls

- Preserve PR #46 session restoration, persistence selection, validated user checks, and sign-out synchronization. Supabase SSR/JS versions are unchanged.
- Preserve image signatures, MIME checks, byte/pixel limits, decode/reencode sanitization, and metadata removal in `features/tools/image/processor.ts`. Preserve the Registry's format allowlist, pixel/page limits, timeout, and quarantine/release boundaries in `features/registry/quarantine-content.ts`.
- Verify both generation SSE (`features/generation/sse-observer.ts`) and public demo SSE (`features/demos/runtime/handlers.ts`), RSC responses, authenticated Server Actions, upload/image paths, Registry authorization, and runtime startup.
- Preserve all existing CI/security gates and browser projects. No assertions, skips, required checks, or browser matrix entries are weakened.

## Validation evidence

The local results below apply to this dependency candidate. The PR records the exact commit and final remote check results. Local browser automation remains suspended by `AGENTS.md`; browser acceptance must come from the unchanged remote CI gates unless the Owner explicitly restores local authorization.

| Check | Status / evidence |
| --- | --- |
| Frozen dependency installation | Passed locally. |
| Typecheck | Passed locally. |
| Lint | Passed locally with zero warnings allowed. |
| Unit tests | Passed locally: 1,421 tests, zero failures or skips. |
| Production build | Passed locally with Next.js 15.5.28. |
| Prisma schema validation | Passed with explicit loopback-only validation URLs. |
| Guarded real isolated Supabase security integration | Passed: 14 suites / 184 tests, no failures, skips or TODOs. CLI 2.109.1, PostgreSQL 17; task-owned `aig-platform-p1-final-sec-a-20261101`, API/DB bound to 127.0.0.1:60921/60922. No dotenv or production connections. |
| Runtime HTTP, RSC, Server Actions, SSE and image smoke | Passed against production build: native login/sign-out actions, SSR validated session/refresh, protected pages, Flight response, chat/tool SSE and persistence, multipart Sharp upload, signed private preview, anonymous/SVG denial and Registry bearer read/cross-origin boundary. AI responses use the existing local Mock Provider; this is not real-Provider or browser acceptance. |
| Migration clean install, Registry upgrade and historical rollback proofs | Running locally in sequence; final results recorded on the PR. |
| Existing remote CI and browser matrix | Pending; attach run/check links and exact tested head. |

## Residual risk and Owner acceptance

`pnpm audit` still reports **0 critical / 19 high / 12 moderate / 1 low** for all dependencies and **0 critical / 6 high / 1 moderate** for production dependencies. These metadata counts are advisory entries, not a count of confirmed exploitable application findings. Production dependency paths include PostCSS/Nanoid/Source Map through Next's build/CSS tooling, Deepmerge through Prisma configuration, and Zod directly and through Vercel OIDC. This patch does not claim an audit-clean graph or expand into unrelated dependency changes; triage these paths separately against their actual call sites and available compatible upstream fixes.

Windows Sharp checks cannot establish Linux/glibc native-library compatibility. Preserve Linux CI build/image checks. Passing functional tests does not reproduce or prove resistance to every exploit payload. SEC-02/SEC-03 remain read-only follow-up findings outside this dependency change.

The HTTP probe initially tried to delete its Registry fixture, and the existing immutable-history guards correctly refused cleanup. The corrected probe revokes its synthetic qualifications and retains the synthetic account/profile/history until the subsequent guarded reset of the entire disposable stack. No Registry trigger, permission, migration or accepted test was changed. Raw probe logs remain ignored locally.

Before merging, the Owner should review the final SHA, complete build/runtime/isolated-database evidence, require all existing CI/browser gates, and assess the residual dependency advisories. Production deployment and the final main merge remain Owner actions.
