# Recruitment demo integration acceptance — 2026-10-29

## Decision

| Scope | Decision | Evidence / limit |
|---|---|---|
| Local core demo | **GO** | Integrated Next.js production server at `http://127.0.0.1:3033`; real login, chat, summary, persisted history, refresh/sign-out pass over HTTP |
| Saved-memory recall | **GO for the checked path** | A uniquely named, explicitly synthetic manual-memory fixture was selected, disclosed in SSE, used by the real Provider, and its use counter persisted |
| Private persona avatar | **GO for apply/read/access** | A real PNG upload fixture in a private local bucket was applied through the real API; signed read returned identical bytes; unauthenticated app read and public Storage URL rejected |
| Explicit-request memory extraction | **GO for the checked path** | Real chat with an explicit request to remember a stable project fact persisted a formal memory; duplicate direct extraction produced no duplicate record |
| General implicit extraction / AI image generation | **NOT accepted** | Recall question produced a `MemoryExtractionFailure` warning in background extraction; general extraction reliability is not proven. Local image-generation key is absent; the PNG fixture was not AI generated |
| Integrated browser / WebKit security acceptance | **NO-GO pending verification** | Trace-based login synchronization fix added; strict assertions preserved. No new local browser run under the standing AGENTS restriction. Separate PRs' browser success does not certify this integrated commit |
| External online demo / production release | **NO-GO** | Preview database INACTIVE, missing Preview AI configuration, Vercel Production binding UNVERIFIED, six migrations missing from the CONFIRMED production Supabase project, external access not accepted |

No main checkout/branch changes, PR merges on GitHub, cloud migrations, cloud data writes, protection changes or deployments were performed. The integration branch disables its own Vercel Git auto-deployment.

## Integrated inputs and conflicts

Base: `main` `0e13d32fdcfd1555172c7d93aa74c036466d0943`.

| PR | Exact head | Original checks at inspection |
|---|---|---|
| #30 | `aad62c88eaa1d5101eb11b15dd21e1d87ba72905` | All checks successful |
| #31 | `da6e0f4ddbf03cca095badc58d5d71a878e7bff0` | Quality, Node 24, DB security and Merge Gates WebKit successful; Security Acceptance WebKit failed |
| #32 | `3c83d90c6ff3b5b07b1de4cb972df8d88f0a89c7` | All checks successful, including both WebKit runs |

Merged locally in that order, preserving each history, with **zero merge conflicts**. Worktree: `D:/AIGC/recruitment-final-integration-20261029`; branch: `codex/recruitment-final-integration-20261029`. `app/`, `components/`, `features/` match #32 exactly. No redesign or new product functionality. Owner must choose an integration strategy: merge this combined PR OR integrate its source PRs then cherry-pick only the acceptance fix, avoiding duplicate delivery.

## PR #31 WebKit investigation

Failure: [Security Acceptance run 40841043884, job 123345090418](https://github.com/ManDik-Chan/AI-Generator/actions/runs/40841043884/job/123345090418), `memory-proposals.spec.ts` source resubmit case. All business assertions completed; afterEach's strict console assertion failed.

Downloaded and inspected the existing trace offline, without launching a browser. Retained evidence is outside the source tree at `D:/AIGC/recruitment-integration-evidence-20261029/pr31-trace` (not committed). Relevant trace monotonic times, milliseconds:

| Event | Time |
|---|---:|
| Login POST starts, subsequently returns 303 | 97303.005 |
| Test issues immediate `goto('/chat')` after URL changes | 97658.583 |
| WebKit console `TypeError: Load failed` from Next action chunk | 97719.659 |
| First chat POST | 98566.225 |
| Edited chat POST | 99300.836 |
| Navigate to memories; business assertions succeed | 99568.368 |

The login POST appears in failed-request diagnostics as cancelled after HTTP 303, with page URL `/workspace`. Two status polling GETs were also cancelled, but started after the console error. This isolates the console failure to initial login/navigation timing, rather than proposal cancellation or access-control failure. Root-cause interpretation: the URL/body-visible check allowed the caller to interrupt the login redirect's response/rendering. It remains a hypothesis until the corrected WebKit test passes.

Minimal test synchronization fix in `tests/e2e/support/isolated-user.ts`: observe the login POST, require a successful status, wait for its transport to finish, require the authenticated app scroll region, and require the login button to disappear before returning. No retries, skipped tests, increased timeouts or diagnostic allowlist changes. Related diagnostic, memory service and recovery tests: **24/24 pass**. Integrated WebKit must still verify this change.

## Six missing migrations and target identity

Read-only audit command (explicit source file; values never printed):

```powershell
node scripts/audit-demo-database.mjs D:/AI-Generator/.env
node scripts/audit-demo-database.mjs .env
```

The script starts a read-only database transaction and emits only migration/schema information and aggregate compatibility counts. It does not migrate, reset, fix or delete data.

- Original `D:/AI-Generator/.env` and Claude's demo worktree resolve to Supabase project **`jdujsbcmxurjiaaoeeqv` / `ai-generator-v2`**, not the Preview project. Original `.env.local` additionally overrides AI to the Playwright mock.
- That cloud DB has **15** applied migrations, no unfinished migration and no checksum drift in applied migrations. It lacks all six migrations below and the inspected memory verification/avatar deletion columns.
- Aggregate preflight found **0** invalid tool-asset/run owner links, **0** duplicate generated-image bucket/path keys, and **0** invalid avatar ownership references. It found **3 AUTO_EXTRACTED memories**. Counts are a point-in-time sample, not a guarantee against concurrent writes or all historical anomalies.
- This integration worktree's ignored `.env` AND `.env.local` use the existing isolated local DB/Auth, not cloud credentials. Local DB has **21** matching applied migrations and no checksum drift; all inspected columns exist. No existing local reset or migration was run; existing data retained except this task's own synthetic fixtures.
- **Supabase project identity — CONFIRMED by Owner**: `jdujsbcmxurjiaaoeeqv` is `ai-generator-v2`'s main **PRODUCTION** branch. The six missing migrations observed through the original `.env` therefore concern a production database. Production migrations and data mutations remain prohibited.
- **Vercel Production `DATABASE_URL` binding — UNVERIFIED**: the connection returns encrypted Secret metadata (`decrypted:false`), so the actual deployment binding is still unverified. This is distinct from the confirmed Supabase project identity. No further request for Secret plaintext or repeated identity confirmation is needed. Production HTTP inspection returned 429, not application acceptance.

| Migration | Changes / historical-data risk |
|---|---|
| `20260724120000_add_trusted_memory_proposals` | Adds revision and owner indexes, Proposal table, transition/source triggers, RLS and restricted grants. Existing memories get revision=1. New write paths and trigger locking must be rehearsed with a restored snapshot |
| `20260727013753_add_memory_verification` | Backfills MANUAL/CHAT_MESSAGE provenance and accepted Proposals; unverified AUTO_EXTRACTED rows become `LEGACY_UNREVIEWED`. Sets verification method NOT NULL, adds timestamp check/index. The three observed old automatic memories will require manual review before normal trusted recall; do not relabel them as trusted |
| `20261028074859_asset_deletion_consistency` | Adds deletion markers, immutable cleanup identities, queue, ownership guards, upload reservations/attachment tracking and avatar fence. Adds compound FK NOT VALID. Legacy bucket/path evidence may become BLOCKED; do not auto-repair or delete historical Storage bytes |
| `20261028080215_asset_deletion_cascade_retry` | Replaces delete trigger with path/ownership quarantine and idempotent queue transitions; preserves completed/blocked evidence |
| `20261028081301_asset_attachment_fence` | Serializes attachment with reservation row locking; rejects reused/retired keys. Review contention and historic key reuse |
| `20261028081742_validate_asset_ownership` | Validates compound tool-asset owner FK. Any historical owner mismatch must stop migration, not be silently reassigned; preflight currently found zero |

All six use explicit BEGIN/COMMIT. Atomicity is **per migration**, not for the entire six-step sequence; a later failure can leave earlier steps committed. Backfills/indexes/ALTER TABLE can lock tables. No down-migration files exist. No applied SQL was edited. Existing CI at the input commits verifies incremental upgrade and injected transaction rollback, but production snapshot restore/upgrade and actual backup restoration have not been rehearsed here.

### Backup / rollback gate for Owner

1. Treat the confirmed project as production. Any future migration maintenance window needs separate authorization; the Vercel deployment binding remains unverified. Do not run `prisma migrate deploy` against any existing cloud/production DB from this handoff.
2. Verify a recent recoverable backup/PITR point and encrypted logical export with migration history, schema/data, required Auth/roles/grants; keep outside the public repo. Independently back up Storage object bytes and inventory, bucket settings/policies, and service/Auth configuration. Supabase database backups cover Storage metadata, **not object bytes** ([official backup guide](https://supabase.com/docs/guides/platform/backups)). No backup creation or cloud restore was executed in this task.
3. Restore into a separate non-production project with its own keys. Rehearse the exact six migrations against the restored historical data, verify checksums/counts, old unreviewed memories, avatar ownership/private reads, access denial and lock duration. Keep RLS and Auth enabled.
4. On failure, stop writes/migrations, retain `_prisma_migrations` state, identify which transaction committed and prefer a reviewed forward fix. Restoring a consistent DB+Storage recovery point requires explicit approval. `migrate resolve --rolled-back` changes migration bookkeeping; it does not reverse SQL ([Prisma 6 recovery guide](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/patching-and-hotfixing)). A blind app rollback is insufficient: old code may not supply the new NOT NULL verification field. Never drop new structures or trust flags merely to get an old build running.

## Final local checks

- Frozen pnpm install / Prisma Client: pass, Node 22.23.1 / pnpm 11.7.0.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`: pass on the integrated tree. Google Fonts initially timed out, then build succeeded without font/UI changes. A Windows Prisma DLL lock during overlapping checks was resolved by finishing DB tests before generation/build; final gates ran sequentially. Downloaded third-party trace viewer assets initially entered ESLint discovery; moved the evidence outside the source tree and reran the unchanged gates successfully.
- `pnpm test -- --no-file-parallelism`: **150 files / 863 tests pass**, 7 DB files / 51 cases skipped in the unconfigured unit invocation.
- `node scripts/run-local-security-stage.mjs integration D:/AIGC/platform-p1-final-isolated-20261028`: **7 real suites / 51 tests pass** (local JWT/RLS/Storage/ownership/usage/memory transactions).
- `pnpm demo:preflight`: pass; local DB/Auth healthy, remote real Provider selected.
- `pnpm demo:smoke -- --extended`: pass against `next start` on 3033, including actual Next login form POST, real chat and summary SSE, exact persisted output/history, session refresh/sign-out, invalid input/auth boundaries, real Provider recall of synthetic saved memory, explicit request to remember a new stable project fact persisted with `EXPLICIT_REQUEST` provenance, and private avatar apply/read/access checks. A separate real explicit-request probe also confirmed one formal memory and idempotent duplicate extraction. Avatar upload fixture is explicitly not AI generated. Background implicit extraction warning remains a separate unaccepted path, not silently treated as success. Final cleanup check found zero remaining task-owned smoke/probe profiles.
- Local API and DB ports remain loopback-only: 56431 / 56432. Own smoke profile, object and cleanup fixture are removed after the test; no pre-existing application data was deleted.
- Browser evidence: reuse Claude #32's public landing screenshots and reported local core browser acceptance, plus original PR CI; no fresh browser/capture performed. The original workspace `D:/AI-Generator/AGENTS.md` requires explicit restoration before new local browser/E2E use. An already open browser tab is not authorization.

## Safe external demonstration plan (not executed)

Current existing #32 Preview: `https://ai-generator-j23kzefy9-man-dik.vercel.app`, READY at `3c83d90`; it is **not this integration build**. Project protection is Vercel Authentication `all_except_custom_domains`; password and trusted-IP protection disabled. No protection changes made.

Preview `DATABASE_URL`, `DIRECT_URL`, Supabase URL/anon/service-role variables exist, but their target identity is not readable. `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` and base Provider configuration are absent from Preview scope; production-only values must not be assumed available. `AI-Generator-Preview` (`lhhowwfhflslykpayjaj`) remains INACTIVE independently of the local Docker stack.

After separate approval: restore/provision the dedicated non-production project, migrate/rehearse there, use narrow **branch-scoped Preview variables** with a budget-limited Provider key and the same project's Auth/Storage credentials, set the exact Preview callback allowlist/site URL, then deploy only the approved integration commit as Preview. Run real Auth/session/chat/summary/memory/avatar and cross-user denial checks there before sharing.

Keep Deployment Protection enabled. Owner can share the **specific accepted deployment** using a revocable Vercel shareable link, restricted operationally to intended interviewers; treat its query parameter as a bearer credential and revoke after the interview. It grants deployment access, not application account access; provide a dedicated non-production app account and separate data ownership. Do not put the share token in README, CI logs or this report. Vercel documents this external-access mechanism in [Sharable Links](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/sharable-links). No link or bypass rule was created here. Until these gates pass, demonstrate locally.

## Owner actions

1. Use `http://127.0.0.1:3033`, create a private local account at `/register`, sign in, then demonstrate chat and summarize. This is the integrated version; port 3029 remains the previous runtime build.
2. Review the combined Draft PR and choose one integration path; leave #30/#31/#32 and main unmerged until reviewed.
3. Verify the WebKit synchronization change on the integrated commit under the authorized browser/CI execution scope; do not waive the console assertion. Recheck automatic extraction before claiming it in the interview. Do not claim image generation without its real Provider configuration and acceptance.
4. Retain CONFIRMED Supabase production identity and UNVERIFIED Vercel binding as separate facts; do not request Secret plaintext. Verify backup/restore readiness. Approve non-production provisioning, environment configuration and Preview release separately if online demo is needed. Cloud/production migration remains prohibited.
