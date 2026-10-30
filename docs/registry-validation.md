# P1-B1 integration validation — 2026-10-30 (Asia/Singapore)

Baseline: `main@c79b6a78d30b5697a842f9491a2a0667cc3168dd` (includes #27/#36).
Original #29: `8ba37c3e5d025ac0185d40b37e6ddf91a589a61f`.
Executable/schema/test candidate: `f002535c612c6db16ee588ac6823f797d87af548`.
The delivery commit adds documentation/evidence only. Final-head checks and head/base/test-merge SHAs are reported on [PR #29](https://github.com/ManDik-Chan/AI-Generator/pull/29/checks); older SHA results are not acceptance for this candidate.

Worktree: `D:/AIGC/p1-b1-main-integration-20261030`.
Disposable stack: `aig-platform-p1-final-b1-20261030`, PostgreSQL 17, CLI 2.109.1.
API/DB were inspected and bound to `127.0.0.1:58321/58322`, with a matching disposable marker, no linked project and no application dotenv files. No production database was queried or modified.

## Migration identity

The unchanged main prefix contains 21 migrations. Two independent Registry transactions follow in order; no historical migration or original Registry SQL was rewritten.

| Migration | SHA-256 |
| --- | --- |
| `20261028135224_project_registry_foundation` | `e697b7b16c93abf204836ff0cfb036999e5f1bf95016c3b0defd1ee10417ff89` |
| `20261030120001_registry_sealing_qualification` | `3b8ebad5fe0d5909ff5d80fe965c9f5aeabb5680ef9b095ffbe643939062ef40` |

A failure in the second file preserves the committed foundation. It does not roll back the whole batch; keep access disabled and investigate an approved forward repair.

## Fresh local acceptance

| Check | This candidate's result |
| --- | --- |
| Node 22.23.1 lint / typecheck | Passed, zero lint warnings |
| Non-database unit tests, Node 22 | 159 files / 1004 passed, 0 skipped; real integration runs separately |
| Node 22 production build | Passed; no database connection required |
| Node 24.22.2 compatibility | Lint, typecheck, 1004 unit tests, isolated Prisma 6.19.3 generation and Next build passed; official runtime ZIP SHA-256 verified |
| P1-A clean installation / repeat deployment / clean failure rollback | Passed; existing checks and assertions retained |
| Registry main-prefix upgrade / each injected rollback / clean installation | Passed; legacy rows unchanged, eight RLS tables, repeated deploy and all 23 migration checksums verified |
| All discovered real database/JWT/PostgREST integration suites | Passed: 8 files / 69 tests, 0 skipped/TODO; Registry 18/18 and all 51 existing P1-A assertions |
| P1-A incremental upgrade and failure rollback | Passed; no legacy data loss; proposal/verification rollback assertions retained |
| Every transactional migration rollback | All 10 explicitly transactional migrations passed, including both Registry files |
| Local private-schema DB lint | Passed, no schema errors |
| Security advisors, fail-on WARN | Ran; exit 1 for one pre-existing public.memory_keywords_valid mutable-search_path warning; no Registry finding |
| Final migration metadata / synthetic fixture cleanup | 23 applied migrations, all checksums match; Auth accounts / Registry projects / operators = 0 / 0 / 0 |
| Document generation / consistency | docs:sync in sync; document suite 10/10 |
| Demo API, real HTTP against Node 22 build | 12/12: descriptors, OpenAPI, JSON, SSE, partial timeout and documented errors |
| Public pages / authentication navigation, HTTP only | 13 pages returned 200; six protected entries redirected to login; /enter and four login return-path checks passed (25 groups including API smoke) |

Registry tests cover real Auth JWTs, anon/service-role denial, authenticated SELECT only, user/project isolation, ADMIN/metadata and forged role/subject/unsigned JWT attacks, private helper ACLs, live qualification/membership revocation, independent can_create, expiry, immutable identity/history, composite foreign keys, independent reviews and lifecycle guards. Natural-expiry tests bind a fresh approval and let database time pass without changing qualification or epoch, then require Version/Release inserts to reject an expired submitter or reviewer. This avoids an epoch-only false pass.

The migration proof seeds historical Persona/Chat/Tools/Memory rows, injects a failure immediately before each Registry COMMIT and compares schema/ACL/RLS/policies/functions/triggers/types/constraints plus all legacy rows. Each migration then upgrades the same database. A fresh installation repeats deploy and verifies every migration name, timestamp, completion state and checksum. The legacy-data snapshot SHA-256 in this run is `fe9214a6d1c0ce796a1d124eea22fee943e58e449c377c3500fb3f07ee916bdd`.

Raw outputs and JWT-bearing stack status stay in ignored test-results. HTTP evidence: `http-compat-20261030.json` SHA-256 `4e612c6b5ff01aba4ecd3001d13182bfc8cf18fec354b7d0cec1676e5722bab0`. Node 24 evidence: `node24-check-20261030.json` SHA-256 `957face73dd224c1e012e09f0df10eb8d0f4be00c27695a45367b9006379d0ab`. Node 24 local checks use installed dependencies, not a fresh pnpm installation; final CI separately installs the lockfile under Node 24.

HTTP server PID 12472 exited and port 3067/process-tree cleanup were verified. No local browser automation was started or connected, per repository AGENTS.md. HTTP/unit checks do not establish real Canvas/Worker/visual behavior; the existing isolated CI browser gates remain required.

The advisor warning belongs to unchanged main migration 20260713110000_add_memory_governance. memory_keywords_valid is an invoker-security immutable SQL validator with no fixed search_path. This remains a separately tracked legacy hardening risk, not a Registry warning or a zero-warning advisor pass; no historical migration or P1-A behavior was changed to suppress it.

## CI and delivery boundary

Final PR run links and conclusions belong to the current PR head, not the old #29 run. Older run 40703982006 initially failed image pulls but its attempt 2 later passed; neither attempt substitutes for this candidate. Until final-head CI passes, local evidence does not grant merge acceptance. All six protected-branch gates, the additional Node 24 job and complete P1-A security suites remain intact.

No production migration, deployment, main merge, public Registry write/publication or B2 work was performed. Compatibility, completed/pending interfaces, Vercel automatic Git deployment, the production migration/rollback plan and ordered B2 handoff are in [the delivery handoff](handoffs/2026-10-30-codex-registry-b1.md).
