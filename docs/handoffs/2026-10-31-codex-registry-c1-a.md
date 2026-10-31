# Codex → Claude / Owner: P1-C1-A

Backend scope only. Research Lab, console pages/components/design, mock adapter and public showcase are unchanged. Start from [the internal read contract](../registry-c1a-read-contracts.md) for precise paths, schemas, errors and authorization semantics.

| Handoff item | Delivery |
| --- | --- |
| C-1 | Server JCS hash in Draft/head reads; HTTP DraftReadDTO |
| C-2 | Browser-safe strict Review and Release-command result contracts |
| C-3 | submittedByViewer / requestedByViewer / approvedByViewer, without other subjects |
| C-4 | Frozen shared role maps with command parity checks; roles alone grant nothing |
| C-5 | Deferred: next-draft command and HTTP writes |
| C-6 | Membership-scoped bounded projects, versions/details, draft reviews/details, Release head/history/requests |
| C-7 | Own active qualifications with effective expiry; project role intersection in effectiveActions |
| C-8 | Default-off GET-only internal Bearer HTTP adapter, strict request/response boundaries and minimum rate limits |

Frontend follow-up is a separate change: implement a Registry ConsoleAdapter against these reads and the shared DTO types; remove browser hashing from real reads; represent request fact state separately from expired/stale and from command eligibility. Do not expect members' identities, authzEpoch, internal audit logs or storage refs. Pagination is UUID order, so UI ordering must be explicit. There is no execute/HTTP write implementation yet; keep real write controls unavailable. This PR does not switch any data source or grant any real actor qualifications.

Local database validation uses the task-owned disposable loopback Supabase project only. Existing browser suspension remains in effect locally; required remote browser CI is retained. Final-head results and limitations are recorded in [validation](../registry-c1a-validation.md).
