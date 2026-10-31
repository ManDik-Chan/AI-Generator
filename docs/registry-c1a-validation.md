# P1-C1-A validation and evidence boundary

Base: `main@fc43538f933acff9b542903e1c8eacbaee9acd87`. Isolated branch/worktree: `codex/p1-c1-a-internal-read-api-20261031`. The final Draft PR records the exact tested head and CI contexts. Historical results from PRs #37–#41 are not acceptance evidence for this change.

The [read contract](registry-c1a-read-contracts.md) and [frontend handoff](handoffs/2026-10-31-codex-registry-c1-a.md) define the delivered scope. Existing migrations, RLS, workflows, accepted assertions, console UI and Research Lab are unchanged. No production Supabase, production migration, public content/asset delivery or deployment was used. All three internal/read/HTTP gates remain false by default; the branch also disables automatic Vercel Git deployment.

## Local evidence

Local verification targets only `aig-platform-p1-final-c1a-20261031`, with API/DB bound to `127.0.0.1:60521/60522`. Existing guards verify disposable marker, project/container labels, exact CLI endpoints, loopback ports and absence of linked project configuration. No application dotenv was copied. Database reset/proof stages and integration tests run serially. A parallel build helper correctly refused a transient non-loopback container state during a guarded reset; the guard was not bypassed, and that invocation is not counted as a passing test.

| Check | Evidence |
| --- | --- |
| Shared contract / HTTP boundary | 2 files / 63 tests passed: 5 shared-contract tests, 58 HTTP tests |
| Added real read suite | 13/13 real Auth/database cases passed, 0 skip/TODO; included again in final-head complete security acceptance |
| Non-database unit tests | Final-head result recorded in PR; integration suites are excluded from this count and run separately with zero skips required |
| TypeScript / ESLint | Passed; final-head checks recorded in PR |
| Node 22 / Node 24 build | Production builds passed locally; final-head CI repeats both |
| Canonical hashing | 31 pinned Python reference vectors passed; reference commit `32a48195b9b20fe67b1795e39e4509f14d860b45` |
| Registry migration proofs | All 26 migration checksums; clean/repeat deploy; 8 RLS tables; 5 incremental Registry upgrades and transaction rollback; historical private Storage bytes/identities/policies/triggers preserved |
| Historical security migration clean | 16 RLS tables, 17 policies, 12 runtime grants; repeat deploy; Proposal/Verification injected rollback without data loss or partial objects |
| Historical incremental upgrade | Passed with preserved old rows; Proposal/Verification injected rollback reported zero data loss and zero partial objects |
| All transactional migration rollback | 13 existing transactional migrations passed catalog/data comparison after injected failures |
| Prisma / docs / security advisor | Validate and docs sync passed; advisor error 0, with only the preexisting public.memory_keywords_valid mutable search_path warning |
| Actual Next HTTP socket smoke | 24/24 passed on the current production build with command flags off; real Auth/signout, authorization/privacy, hashes, origin/input/method rejection; server PID/port and fixtures cleaned |
| Complete security acceptance | Runs against the final committed head; exact report and any limitations recorded in PR |

The new real suite covers canonical Draft hashes and uninitialized reads, read gates with all command flags closed, own qualification expiry and role intersection, viewer-relative identity, legacy receipt compatibility, sealed provenance, request/approval/consumption/withdrawal facts, pagination, foreign project/object IDs, selector injection, OWNER/ADMIN/metadata rejection, independent READ_DRAFT/READ_RELEASE, session deletion/not_after, operator/action/member revocation, expiry during a read transaction, and real Auth through the HTTP response whitelist. Project summaries deliberately exclude currentReleaseId so READ_DRAFT cannot substitute for READ_RELEASE.

The complete existing integration discovery runner requires every suite/assertion to execute and rejects empty, skipped, TODO or failed reports. Raw logs, reports, synthetic identities and credentials remain in ignored `test-results`; only non-sensitive counts, outcomes and evidence digests belong in the public PR.

## Limits and retained gates

Local browser automation remains suspended under AGENTS.md. No local browser, screenshots, recordings or browser/E2E tests were launched. Both existing remote browser matrices, the real Supabase security acceptance, Node 24 and all other required CI remain intact. The final PR must distinguish completed checks from pending/failed checks and cite the final head.

The rate limiter is process-local and needs shared ingress enforcement before any multi-instance enablement. List pagination is bounded UUID order, not chronological or a snapshot across requests. Qualification/role results and request fact flags do not replace command authorization. HTTP writes, next-draft commands, public Registry and asset delivery remain deferred. Completion of this read foundation does not imply Owner acceptance, merge or deployment authorization.
