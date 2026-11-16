# CI port reservation and text-tool conflict payload, 2026-11-16

Two independent changes, each on its own branch from `main` at `93ce848`. No pull request was merged. Local browser automation stayed suspended, so no local browser, screenshot, or end-to-end run was performed. Remote CI browser gates were left in place.

## 1. Security Acceptance port collision

Pull request: https://github.com/ManDik-Chan/AI-Generator/pull/64

Run `43786471171` on #61 (head `e622784`) failed `Authenticated E2E (chromium-desktop)` before any browser test: `supabase start` reported a local port already allocated, and the single immediate retry from `09e9194` hit the same collision. The required `authenticated Playwright` aggregator failed with it. Run `43725689545` on 2026-11-15 failed `Authenticated E2E (webkit-iphone)` the same way. Neither failure concerns the code under test.

`supabase/config.toml` publishes 54320–54322, inside the Linux ephemeral port range, so an outbound runner connection can hold one of them as its source port. The raw startup log is withheld by design, so the holding socket was not observed. The explanation fits the evidence but is not directly confirmed.

#64 reserves 54320–54329 with `net.ipv4.ip_local_reserved_ports` as the first step of every job that starts Supabase. The start helper now waits 20 s and then 45 s between attempts and prints the socket state and port numbers of whatever holds the ports. Other startup failures are still not retried. No check name, `needs` edge, or acceptance stage changed.

The failed jobs of run `43786471171` were rerun as attempt 2 on the unchanged head `e622784`. That rerun was in progress when this note was written.

Until a branch contains #64, its Security Acceptance jobs can still hit the collision. That applies to #61, #63, and #65. A collision there is a runner condition, and rerunning the failed jobs is the remedy.

## 2. Text-tool conflict payload

Pull request: https://github.com/ManDik-Chan/AI-Generator/pull/65

Interface change: `POST /api/tools/run` answers a Prisma `P2034` serialization conflict with status 429 and `{ code: "RATE_LIMITED", message }`. It no longer adds `limit`, `used`, and `remaining`. Those fields previously reported the daily limit as fully used, which the ledger did not record. `DAILY_LIMIT` is unchanged and still carries the real figures. The brainstorm, image, and Agent creation routes already reported the conflict this way.

`features/tools/components/tool-runner.tsx` does not read quota figures from an error response. No other caller in the repository read them.

This closes the first item under "Left unfixed" in `docs/handoffs/2026-11-15-overnight-sequential-close.md`, which #63 adds.

## Validation

Local, Node 22.

- #64, head `c01e0ad`: `pnpm exec vitest run --exclude "tests/integration/**"` passed (213 files, 1 skipped; 1692 tests, 15 skipped). `pnpm typecheck` and `pnpm lint` passed.
- #65, behavior commit `faeef13`: the same unit command passed (213 files, 1 skipped; 1690 tests, 15 skipped). `pnpm typecheck` and `eslint app/api/tools/run` passed.

Not verified locally: the `sysctl` step and `ss` output on a hosted runner, a real `supabase start`, real database integration tests, and a real concurrent `P2034`. The collision retry path is covered by unit tests only. Required CI on both pull requests had not completed when this note was written; the pull request checks are the record.

## Left unchanged

- `public.memory_keywords_valid` still has no fixed `search_path`. No forward migration was added. Once merged, a new migration leaves production with a pending migration, and production has no current full backup.
- `createPendingToolRun` still does not return `unlimited`. The text-tool UI does not read that flag.

## Waiting for the Owner

- Merges. #61 then #63 are stacked. #64 and #65 are independent of them and of each other.
- Whether to schedule the `memory_keywords_valid` forward migration, given the production migration and backup it implies.
- Production backup, Registry flags, production migration, and browser acceptance, as before.
