# Overnight sequential work, closing note

Work followed `docs/handoffs/2026-11-15-overnight-sequential-work.md`. No pull request was merged. Local browser automation stayed suspended, so no local browser, screenshot, or end-to-end run was performed. Remote CI browser gates were left in place.

## 1. Dependency advisories

Pull request: https://github.com/ManDik-Chan/AI-Generator/pull/60

Head `0584347` (`claude/deps-security-20261115`). Required checks on that head succeeded: `lint`, `typecheck`, `unit tests`, `build`, `Supabase Security Acceptance`, and `authenticated Playwright`. The same head also succeeded for both Supabase acceptance jobs, the three authenticated browser projects, Node 24 compatibility, the Registry JCS reference, and Vercel Preview Comments.

`9b8f84c` failed `Authenticated E2E (webkit-iphone)` before any browser test because `supabase start` reported a local port already allocated. `09e9194` retries that collision once. `0584347` adds the type declaration that check needs. A second collision, and any other startup failure, still fail the job.

`deepmerge-ts` remains through `@prisma/config` 6.19.3. Prisma was not upgraded.

## 2. Create qualification

Pull request: https://github.com/ManDik-Chan/AI-Generator/pull/61

Stacked on #60. Head `3dcd063` (`cursor/can-create-qualification-b808`). The same check set as #60 succeeded on that head, including the required checks named above.

`GET /qualifications` now returns `create: { expiresAt } | null`, taken from the internal operator `can_create` flag and `expires_at`. The developer console shows the create form only when `create` is present. The copy that said eligibility was decided on submit was removed.

Local validation on `3dcd063`, before CI: `pnpm typecheck`, and 138 unit tests across 8 files. Real database integration tests were not run locally.

## 3. Database hardening

No migration was added.

The repository records one legacy database risk in `docs/registry-validation.md` and the 2026-10-30 and 2026-11-02 handoffs: `public.memory_keywords_valid`, created by already-applied migration `20260713110000_add_memory_governance`, is an immutable SQL function with no fixed `search_path`. Those notes say not to edit that historical migration and not to suppress the advisor warning. They do not name a forward migration, the replacement function body, or the `search_path` value to set. No other handoff, review note, or doc names an unapplied schema, RLS, or privilege change exactly enough to implement. Inventing one would violate the rule for this item.

## 4. Review

Reviewed chat persistence and cancellation, tool-quota reservation, and the Agent run state machine.

### Fixed

Pull request: https://github.com/ManDik-Chan/AI-Generator/pull/63

Stacked on #61. Local checks for the behavior change ran on `0ec502b`. The following commit only records this pull request URL.

`finishAgentRun` updated active workers to terminal states and then returned without finishing the run when the assistant message was no longer `PENDING`. A chat cancel does that: `POST /api/chat/messages/{id}/cancel` previously marked only the message `CANCELLED`, so the next finish committed worker timeouts or failures while the Agent run stayed `PENDING`.

The finish transaction now updates the assistant message first and returns before any worker write when that update matches nothing. Stale reconciliation claims the run before it times workers out, and returns the run unchanged when that claim is lost. Cancelling an assistant message that belongs to a pending Agent run now cancels that run.

Local validation of the behavior change, on `0ec502b`: `pnpm typecheck`, plus `features/agents/run-state-behavior.test.ts`, `features/chat/cancel-route.test.ts`, `features/agents/worker-cancellation-contract.test.ts`, and `features/agents/service.test.ts` (4 files, 17 tests).

Required CI on `eb8f2df` succeeded: `lint`, `typecheck`, `unit tests`, `build`, `Supabase Security Acceptance`, and `authenticated Playwright`. The same head also succeeded for both Supabase acceptance jobs, the three authenticated browser projects, Node 24 compatibility, the Registry JCS reference, and Vercel Preview Comments. The commit that records this result does not change runtime behavior. Its own required CI is separate and was not complete when this sentence was written.

### Left unfixed

- `POST /api/tools/run` answers a Prisma `P2034` serialization conflict with `used` and `remaining` set as if the daily limit were already consumed (`app/api/tools/run/route.ts`). The brainstorm, image, and Agent creation routes report the same conflict without those figures. No client assertion was found that requires the invented usage numbers, and no change was made to that error payload.
- `createPendingToolRun` does not return `unlimited`, unlike the vision, image-generation, and brainstorm reservations (`features/tools/usage.ts`). The text-tool UI does not read that flag. The admin bypass itself still records a ledger row and does not reject the run.

No other chat, quota, or Agent-state defect was both clear and validated tightly enough to change.

## Waiting for the Owner

- Merge order: #60, then #61, then the Agent terminal-state pull request. None were merged here.
- Production backup, Registry flags, production migration, and browser acceptance.
- Whether to schedule a forward fix for `memory_keywords_valid`, and whether the text-tool serialization-conflict payload should stop reporting a full daily limit.
