# CI pipeline: topology, required checks and the 2026-11 de-duplication

Two workflows run on every pull request: **Merge Gates** and **Security Acceptance**. Both cancel superseded runs of the same PR (`concurrency: …-${{ github.event.pull_request.number }}`, `cancel-in-progress: true`).

## Required status checks

The `Protect main branch` ruleset (strict: branches must be up to date) requires these check names, all produced by GitHub Actions:

| Required check | Job |
| --- | --- |
| `lint`, `typecheck`, `unit tests`, `build` | Merge Gates `quality` matrix (Node 22) |
| `Supabase Security Acceptance` | Security Acceptance aggregator over both Supabase acceptance jobs |
| `authenticated Playwright` | Security Acceptance aggregator over Supabase acceptance and the browser matrix |

`Registry JCS Python reference`, `Node 24 compatibility` and the per-project browser jobs run on every PR but are not required by the ruleset; a failure is still visible on the PR. `scripts/ci-topology.test.ts` keeps each required name defined exactly once.

## Current topology

```
Merge Gates          Registry JCS Python reference
                     lint · typecheck · unit tests · build            (Node 22)
                     Node 24 compatibility                            (lint, typecheck, test, build)

Security Acceptance  Supabase Security Acceptance (clean install and integration) ─┐
                     Supabase Security Acceptance (upgrade and rollback) ──────────┤
                                                                                   ▼
                                                     Supabase Security Acceptance (aggregator, required)
                                                                                   ▼
                     Authenticated E2E (chromium-desktop | chromium-mobile | webkit-iphone)
                                                                                   ▼
                                                     authenticated Playwright (aggregator, required)
```

- **Clean install and integration** (own runner, own disposable Supabase): migrations → disaster-recovery RLS baseline check → clean migration metadata and Proposal/Verification rollback → Registry clean install, main upgrade and rollback → all real integration suites → static gates (lint, typecheck, unit tests with the database environment present, `prisma validate`).
- **Upgrade and rollback** (own runner, own disposable Supabase): old-database upgrade with Proposal/Verification rollback → every transactional historical migration's injected rollback.
- Every migration verifier starts with `supabase db reset` on its own disposable target, so neither job depends on the other's database state. Both run the existing loopback binding and ownership guards.
- The browser matrix starts only after the required `Supabase Security Acceptance` aggregator succeeds, as before, and runs each project on its own runner with its own Supabase, build and server (`--workers=1`).

## What changed and why (2026-11-01)

### Audit of the previous topology

Measured from the GitHub Actions API for the last three PR commits before the change (2026-10-31; job durations are runner start → completion):

| Commit | Merge Gates jobs / wall / runner-min | Security Acceptance jobs / wall / runner-min | Per commit: jobs / runner-min / wall |
| --- | --- | --- | --- |
| `0639050` (#42) | 9 / 8.5 / 22.8 | 5 / 26.5 / 38.5 | 14 / 61.3 / 26.5 |
| `62f82d8` (#43) | 9 / 11.3 / 26.4 | 5 / 32.1 / 44.3 | 14 / 70.7 / 32.1 |
| `d87c49f` (#42) | 9 / 11.2 / 32.0 | 5 / 30.7 / 45.8 | 14 / 77.8 / 30.7 |

Per commit the two workflows started 7 disposable Supabase instances, ran 8 production builds, installed browsers 6 times and executed the full authenticated Playwright suite twice for each of the three projects.

| Duplication | Finding |
| --- | --- |
| Two authenticated browser matrices | Merge Gates `authenticated Playwright (<project>)` and Security Acceptance `Authenticated E2E (<project>)` were line-for-line identical (runner, environment, Supabase start, migrations, build, `playwright test --project=… --workers=1`, sanitization) except job names, `needs`, artifact names, and one step: Merge Gates re-applied `prisma/rls.sql` after the migrations. Only the Security Acceptance matrix feeds a required check. The Merge Gates copy cost 16.3–26.2 runner-minutes per commit. |
| Serial migration proofs | The single Supabase job ran clean, Registry, integration, incremental and rollback-all proofs in sequence (18.6–23.3 min). Incremental upgrade and rollback-all (6.6–7.1 min) sat on the critical path even though each resets its own database. The browser matrix waited for all of it. |
| Static gates inside Supabase acceptance | Lint, typecheck and unit tests also run in Merge Gates. See “Retained” below. |

### What `prisma/rls.sql` re-application actually tested

`prisma/rls.sql` is the repeatable disaster-recovery baseline; production applies the same controls through versioned migrations. A local run on a task-owned disposable Supabase compared the catalog of a freshly migrated database with the catalog after applying the baseline once and twice (inside one transaction, rolled back): 461 facts — RLS flags of 28 tables, 25 policies, table/column/function privileges, 15 function definitions and 29 triggers. All matched. The only textual differences were in `handle_new_auth_user()` and `protect_profile_system_fields()`, where the migration writes `BEGIN … NEW."id"` and the baseline writes `begin … new.id` — identical to PostgreSQL (keyword case, quoted lowercase identifiers). The second browser matrix therefore exercised a database identical to the first in every security-relevant catalog fact.

### Changes

1. **One browser matrix.** The Merge Gates copy is removed. Browser coverage is unchanged: the same three projects and the same specs run once per commit in Security Acceptance, behind real Supabase acceptance, and still gate the required `authenticated Playwright` check.
2. **The baseline is verified directly.** `scripts/verify-rls-baseline.mjs` (in the clean-install job, right after migrations) snapshots the catalog, applies `prisma/rls.sql` twice inside one transaction, compares and rolls back. Any difference in RLS flags, policies, privileges, triggers or function source (after PostgreSQL's own case/quoting/whitespace equivalences, with string literals and comments kept significant) fails `Supabase Security Acceptance`. This is stricter than before: previously a drift that did not break a browser flow went unnoticed, and the check that ran was not required. Locally it detected a loosened policy, a changed exception literal and a removed column grant.
3. **Parallel Supabase acceptance.** Upgrade and rollback proofs moved to their own job and runner with their own disposable Supabase. `Supabase Security Acceptance` keeps its name as a fail-closed aggregator (`if: always()`, fails unless both jobs report `success`), so the ruleset needs no change. The browser matrix still `needs: supabase-security-acceptance`.

Structural effect per commit:

| | Before | After |
| --- | --- | --- |
| Jobs (Merge Gates + Security Acceptance) | 9 + 5 = 14 | 6 + 7 = 13 (2 of them are 1-step aggregators) |
| Disposable Supabase starts | 7 | 5 |
| Production builds | 8 | 5 |
| Browser installs / Playwright project runs | 6 / 6 | 3 / 3 |
| Dependency installs | 12 | 10 |
| Steps between PR open and browser matrix start | all five migration/integration proofs in series | the longer of the two parallel Supabase jobs |

Measured wall-clock and runner-minute results for the first runs of the new topology are recorded in the PR that introduced it; no timing improvement is claimed here before it is measured.

### Retained, with reasons

- **Static gates in the clean-install job.** They repeat lint/typecheck/unit tests from Merge Gates, but run the unit suite with the real database environment present and include `prisma validate`, which runs nowhere else. Cost 0.5–0.8 min.
- **Node 24 compatibility.** Repeats lint/typecheck/test/build on a different runtime; it is the only Node 24 coverage.
- **Separate dependency installs and Supabase starts per job.** Jobs run on separate runners for isolation; the pnpm store is already cached by `actions/setup-node`. Production builds in the browser jobs embed that job's Supabase URL and key, so they are not shared across jobs.
- **Ordering.** The browser matrix still waits for Supabase acceptance; required checks are unchanged; nothing is skipped by path filters or `continue-on-error`.

### Possible further work (not done)

- Starting Supabase and installing the Playwright browser concurrently inside each browser job (0.3–2 min per job).
- Caching Playwright browser downloads or Supabase images; benefit uncertain against restore time.
